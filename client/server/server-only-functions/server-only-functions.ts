import "server-only";
import { addMonths, differenceInDays } from "date-fns";
import { and, desc, eq, getColumns, inArray, or, sql } from "drizzle-orm";
import { camelCase } from "lodash";
import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import z from "zod";
import { C, IS_RR_INSTANCE, rrBasicLimits, rrPremiumLimits } from "~/helpers/constants.ts";
import { getRankedAverageFormat } from "~/helpers/roundFormats.ts";
import type { Ranking, RecordRanking } from "~/helpers/types/Rankings.ts";
import {
  type ContestType,
  type Creator,
  type FullSession,
  type GetOrCreatePersonObject,
  type MemberRequestDetails,
  type OrganizationDetails,
  type OrganizationMetadata,
  type RecordCategory,
  RecordCategoryValues,
} from "~/helpers/types.ts";
import { fetchWcaPerson, getHasRole, getNameAndLocalizedName } from "~/helpers/utility-functions.ts";
import type { EnterAttemptPayloadDto } from "~/helpers/validators/EnterAttemptPayload.ts";
import { auth } from "~/server/auth.ts";
import { type DbTransactionType, db } from "~/server/db/provider.ts";
import { membersTable, usersTable } from "~/server/db/schema/auth-schema.ts";
import { contestsTable } from "~/server/db/schema/contests.ts";
import { eventCategoriesPublicCols, eventCategoriesTable } from "~/server/db/schema/event-categories.ts";
import {
  type EventResponse,
  type EventResponseWithCategory,
  eventsPublicCols,
  eventsTable,
  type FullEvent,
  type SelectEvent,
} from "~/server/db/schema/events.ts";
import type { FullMemberRequest } from "~/server/db/schema/member-requests.ts";
import { type PersonResponse, personsPublicCols, personsTable, type SelectPerson } from "~/server/db/schema/persons.ts";
import { type PostResponse, postsPublicCols, postsTable } from "~/server/db/schema/posts.ts";
import {
  type InsertRecordConfig,
  recordConfigsPublicCols,
  recordConfigsTable,
} from "~/server/db/schema/record-configs.ts";
import { type RegionResponse, regionsPublicCols, regionsTable } from "~/server/db/schema/regions.ts";
import { resultsTable } from "~/server/db/schema/results.ts";
import type { SettingKey } from "~/server/db/schema/settings.ts";
import { sendErrorEmail } from "~/server/email/mailer.ts";
import { type LogCode, logger } from "~/server/logger.ts";
import type { OrganizationRole, OrgPluginPermissions } from "~/server/organization-permissions.ts";
import type { AdminPluginPermissions, Role } from "~/server/permissions.ts";
import { RrActionError } from "~/server/safe-action.ts";
import { personsArrayJsonSql } from "~/server/server-only-functions/persons-functions.ts";

export function logMessage(
  code: LogCode,
  message: string,
  { metadata, sendErrorLogEmail = false }: { metadata?: object; sendErrorLogEmail?: boolean } = {},
) {
  const messageWithCodeAndTimestamp = `${new Date().toISOString()} [${code}] ${message}`;

  // Log to terminal/Docker container (except page visit logs)
  if (code !== "RR0001") console.log(messageWithCodeAndTimestamp);

  if (!process.env.VITEST) {
    try {
      // The metadata is then handled in logger-utils.js
      const childObject: any = { rrCode: code };
      if (metadata) childObject.rrMetadata = metadata;

      logger.child(childObject).info(messageWithCodeAndTimestamp);
    } catch (err) {
      console.error("Error while sending log to Supabase Analytics:", err);
    }

    if (code === "RR5000" && sendErrorLogEmail) {
      getSettingFromDb({ key: "error-logs-contact-email", organizationId: null, optional: true })
        .then((contactEmail) => {
          if (contactEmail) sendErrorEmail(contactEmail, code, message);
        })
        .catch((err) => console.error("Error while sending email about error log:", err));
    }
  }
}

export async function authorizeUser(
  {
    useOrganization,
    orgPermissions,
    orgRole,
    permissions,
    role,
  }:
    | {
        useOrganization: false;
        orgPermissions?: never;
        orgRole?: never;
        permissions?: AdminPluginPermissions;
        role?: Role;
      }
    | {
        useOrganization: true;
        orgPermissions?: OrgPluginPermissions;
        orgRole?: OrganizationRole;
        permissions?: never;
        role?: never;
      },
  httpHeaders?: ReadonlyHeaders,
): Promise<FullSession & { httpHeaders: ReadonlyHeaders }> {
  const hdrs = httpHeaders ?? (await headers());
  const session = await auth.api.getSession({ headers: hdrs });

  if (!session) redirect("/login");

  let member: typeof auth.$Infer.Member | undefined;
  let organization: OrganizationDetails | undefined;

  // It could be that the organization no longer exists, hence the try/catch
  try {
    member = session.session.activeOrganizationId ? await auth.api.getActiveMember({ headers: hdrs }) : undefined;
    organization = session.session.activeOrganizationId
      ? await getOrgDetails({ session, id: session.session.activeOrganizationId })
      : undefined;
  } catch {}

  if (useOrganization) {
    if (!session.session.activeOrganizationId || !organization || !member) redirect("/"); // go back to org selection
    if (
      IS_RR_INSTANCE &&
      !organization.subscription &&
      differenceInDays(new Date(), organization.createdAt) > C.rrDaysBeforeStartingFreeTrial &&
      (orgPermissions?.competitions ||
        orgPermissions?.meetups ||
        orgPermissions?.onlineComps ||
        orgPermissions?.events ||
        orgPermissions?.invitation ||
        orgPermissions?.persons ||
        orgPermissions?.videoBasedResults)
    ) {
      throw new RrActionError("There is no active subscription for this space");
    }

    if (orgPermissions) {
      const { success } = await auth.api.hasPermission({ headers: hdrs, body: { permissions: orgPermissions } });
      if (!success) throw new RrActionError("You are unauthorized to perform this action");

      // The user must be an owner or have an assigned person to be able to do any operation except creating video-based results
      if (
        !getHasRole("owner", member.role) &&
        !member.personId &&
        (Object.keys(orgPermissions).some((key) => key !== "videoBasedResults") ||
          orgPermissions.videoBasedResults?.some((perm) => perm !== "create"))
      ) {
        throw new RrActionError("You must have a person linked to your member profile to perform this action");
      }
    }

    if (orgRole && !getHasRole("owner", member.role) && !getHasRole("admin", session.user.role)) {
      const hasRole = getHasRole(orgRole, member.role);
      if (!hasRole) throw new RrActionError("You are unauthorized to perform this action");
    }
  } else {
    if (permissions) {
      const { success } = await auth.api.userHasPermission({ body: { userId: session.user.id, permissions } });
      if (!success) throw new RrActionError("You are unauthorized to perform this action");
    }

    if (role) {
      const hasRole = getHasRole(role, session.user.role);
      if (!hasRole) throw new RrActionError("You are unauthorized to perform this action");
    }
  }

  return { ...session, member, organization, httpHeaders: hdrs };
}

export async function getOrgDetails({
  session: s,
  id,
  slug,
}: {
  session?: typeof auth.$Infer.Session;
  id?: string;
  slug?: string;
}): Promise<OrganizationDetails> {
  const organization: OrganizationDetails = await db.query.organizations
    .findFirst({
      columns: { id: true, name: true, slug: true, logo: true, metadata: true, createdAt: true },
      where: id ? { id } : { slug },
    })
    .then((res) => {
      if (!res) throw new RrActionError("Space not found");
      return { ...res, metadata: JSON.parse(res.metadata!) as OrganizationMetadata };
    });

  const session = s ?? (await auth.api.getSession({ headers: await headers() })) ?? undefined;
  const isSiteAdmin = session && getHasRole("admin", session.user.role);

  if (session?.session.activeOrganizationId && session.session.activeOrganizationId !== organization.id) redirect("/");
  if (organization.metadata.private && !session?.session.activeOrganizationId && !isSiteAdmin) redirect("/login");

  if (IS_RR_INSTANCE) {
    const subscription = await db.query.subscriptions.findFirst({
      where: { referenceId: organization.id, status: { in: ["active", "trialing"] }, canceledAt: { isNull: true } },
    });

    if (subscription) {
      organization.subscription = getOrgSubscription(subscription);
    } else if (!session) {
      throw new RrActionError("There is no active subscription for this space");
    } else {
      const member = await db.query.members.findFirst({
        columns: { role: true },
        where: { organizationId: organization.id, userId: session.user.id },
      });
      if ((!member || !getHasRole("owner", member.role)) && !isSiteAdmin)
        throw new RrActionError("There is no active subscription for this space");
    }
  }

  return organization;
}

export async function getRecordConfigs(
  organizationId: string,
  {
    recordCategory,
    contestType,
  }: { recordCategory: RecordCategory; contestType?: never } | { recordCategory?: never; contestType: ContestType },
) {
  return await db
    .select(recordConfigsPublicCols)
    .from(recordConfigsTable)
    .where(
      and(
        eq(recordConfigsTable.organizationId, organizationId),
        eq(
          recordConfigsTable.category,
          recordCategory ??
            (contestType === "online" ? "online" : contestType === "meetup" ? "meetups" : "competitions"),
        ),
      ),
    );
}

export async function getRecords({
  organizationId,
  eventCategory,
  recordCategory,
  eventId,
  regionCode,
}: {
  organizationId: string;
  eventCategory: string;
  recordCategory: RecordCategory;
  eventId?: string;
  regionCode?: string;
}): Promise<RecordRanking[]> {
  const events = await db.query.events.findMany({
    columns: { eventId: true },
    where: { organizationId, eventId, hidden: false, category: { categoryId: eventCategory, hidden: false } },
  });

  const region = regionCode
    ? await db.query.regions.findFirst({ where: { organizationId, code: regionCode, type: { ne: "meta-region" } } })
    : undefined;

  // Similar to the code in getRecordResult()
  const recordTypes = ["WR"];
  if (regionCode) {
    if (!region) throw new RrActionError("Region not found");
    recordTypes.push(region.superRegionRecordType!);
    if (region.type !== "super-region") recordTypes.push("NR");
  }

  const records = await db
    .select({
      eventId: eventsTable.eventId,
      result: resultsTable,
      persons: sql`(SELECT ${personsArrayJsonSql} FROM ${personsTable} WHERE ${personsTable.id} = ANY(${resultsTable.personIds}))`,
      contest: {
        competitionId: contestsTable.competitionId,
        shortName: contestsTable.shortName,
        regionCode: contestsTable.regionCode,
        type: contestsTable.type,
      },
    })
    .from(eventsTable)
    .innerJoin(
      resultsTable,
      and(eq(eventsTable.organizationId, resultsTable.organizationId), eq(eventsTable.eventId, resultsTable.eventId)),
    )
    .leftJoin(
      contestsTable,
      and(
        eq(resultsTable.organizationId, contestsTable.organizationId),
        eq(resultsTable.competitionId, contestsTable.competitionId),
      ),
    )
    .where(
      and(
        eq(eventsTable.organizationId, organizationId),
        eq(resultsTable.approved, true),
        inArray(
          eventsTable.eventId,
          events.map((e) => e.eventId),
        ),
        eq(resultsTable.recordCategory, recordCategory),
        or(
          inArray(resultsTable.regionalSingleRecord, recordTypes),
          inArray(resultsTable.regionalAverageRecord, recordTypes),
        ),
        region
          ? eq(region.type === "super-region" ? resultsTable.superRegionCode : resultsTable.regionCode, region.code)
          : undefined,
      ),
    )
    .orderBy(desc(resultsTable.date));

  return records.map((r) => {
    const type = recordTypes.includes(r.result.regionalSingleRecord as any)
      ? recordTypes.includes(r.result.regionalAverageRecord as any)
        ? "single-and-avg"
        : "single"
      : "average";

    return {
      rankingId: `${r.result.id}_${type}`,
      type,
      eventId: r.eventId,
      date: r.result.date,
      persons: r.persons as Pick<PersonResponse, "id" | "name" | "localizedName" | "regionCode" | "wcaId">[],
      best: r.result.best,
      average: r.result.average,
      attempts: r.result.attempts,
      contest: r.contest,
      videoLink: r.result.videoLink,
      discussionLink: r.result.discussionLink,
    };
  });
}

export async function getRankings(
  organizationId: string,
  event: EventResponse,
  type: "single" | "average" | "all-avg-formats",
  recordCategory: RecordCategory | "all",
  {
    show = "persons",
    region: regionCode,
    topN = 100,
  }: {
    show?: "persons" | "results";
    region?: string;
    topN?: number;
  },
): Promise<Ranking[]> {
  z.strictObject({
    type: z.enum(["single", "average", "all-avg-formats"]),
    recordCategory: z.enum([...RecordCategoryValues, "all"]),
    show: z.enum(["persons", "results"]).optional(),
    regionCode: z.string().nonempty().optional(),
    topN: z.int().min(1).max(C.maxRankings),
  }).parse({ type, recordCategory, show, regionCode, topN });

  const bestOrAverage = type === "single" ? "best" : "average";
  const rankedAverageFormat = getRankedAverageFormat(event.defaultRoundFormat);
  const sortDirection = event.higherIsBetter ? sql`DESC` : sql`ASC`;
  const recordCategoryCondition =
    recordCategory === "all" ? sql`` : sql`AND ${resultsTable.recordCategory} = ${recordCategory}`;
  const numberOfAttemptsCondition =
    type === "average" ? sql`AND CARDINALITY(${resultsTable.attempts}) = ${rankedAverageFormat.attempts}` : sql``;
  const region = regionCode
    ? await db.query.regions.findFirst({ where: { organizationId, code: regionCode, type: { ne: "meta-region" } } })
    : undefined;
  if (regionCode && !region) throw new RrActionError("Region not found");
  const regionCondition =
    region?.type === "super-region"
      ? sql`AND ${resultsTable.superRegionCode} = ${regionCode}`
      : regionCode
        ? sql`AND ${resultsTable.regionCode} = ${regionCode}`
        : sql``;
  let rankings: Ranking[];

  const mapRankingsData = (val: any[]) =>
    val.map((item: any) => {
      const objectWithCamelCase: any = {};
      for (const [key, value] of Object.entries(item)) {
        if (key === "date") objectWithCamelCase[camelCase(key)] = new Date(value as string);
        // RANK() returns a BIGINT and result is BIGINT in the DB, which Drizzle returns as a string, so both need to be converted
        else if (["ranking", "result"].includes(key)) objectWithCamelCase[camelCase(key)] = Number(value);
        else objectWithCamelCase[camelCase(key)] = value;
      }
      return objectWithCamelCase;
    });

  // Top persons
  if (show === "persons") {
    rankings = await db
      .execute(sql`
        WITH personal_records AS (
          SELECT DISTINCT ON (person_id)
            CONCAT(${resultsTable.id}, '_', person_id) AS ranking_id,
            ${resultsTable.date},
            person_id,
            ${resultsTable.personIds} AS persons,
            ${resultsTable[bestOrAverage]} AS result,
            ${resultsTable.attempts},
            CASE WHEN ${resultsTable.competitionId} IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'competitionId', ${contestsTable.competitionId},
                'shortName', ${contestsTable.shortName},
                'type', ${contestsTable.type},
                'regionCode', ${contestsTable.regionCode}
              )
            ELSE NULL END AS contest,
            ${resultsTable.videoLink},
            ${resultsTable.discussionLink}
          FROM ${resultsTable}
            LEFT JOIN ${contestsTable}
              ON ${resultsTable.organizationId} = ${contestsTable.organizationId}
                AND ${resultsTable.competitionId} = ${contestsTable.competitionId},
            UNNEST(${resultsTable.personIds}) AS person_id
          WHERE ${resultsTable.organizationId} = ${organizationId}
            AND ${resultsTable.approved} IS TRUE
            AND ${resultsTable.eventId} = ${event.eventId}
            ${recordCategoryCondition}
            AND ${resultsTable[bestOrAverage]} > 0
            ${numberOfAttemptsCondition}
            ${regionCondition}
          ORDER BY person_id, ${resultsTable[bestOrAverage]} ${sortDirection}, ${resultsTable.date}
        ), rankings AS (
          SELECT
            personal_records.*,
            RANK() OVER (ORDER BY personal_records.result ${sortDirection} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ranking,
            (SELECT ${personsArrayJsonSql} FROM ${personsTable} WHERE ${personsTable.id} = ANY(personal_records.persons)) AS persons
          FROM personal_records
          ORDER BY ranking, personal_records.date
        )
        SELECT * FROM rankings
        WHERE rankings.ranking <= ${topN}
      `)
      .then(mapRankingsData);

    // If getting single rankings for an event that has memo, set the memo time from the attempts array for each entry
    if (type === "single" && event.hasMemo) {
      rankings = rankings.map((ranking) => {
        let memo: number | null = null;
        const numberOfAttemptsEqualToBest = ranking.attempts.filter((a) => a.result === ranking.result).length;
        if (numberOfAttemptsEqualToBest === 1)
          memo = ranking.attempts.find((a) => a.result === ranking.result)!.memo ?? null;
        return { ...ranking, memo };
      });
    }
  }
  // Top singles
  else if (type === "single") {
    rankings = await db
      .execute(sql`
        WITH rankings AS (
          SELECT
            CONCAT(${resultsTable.id}, '_', attempts_data.attempt_number) AS ranking_id,
            RANK() OVER (ORDER BY CAST(attempts_data.attempt->>'result' AS BIGINT) ${sortDirection} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ranking,
            ${resultsTable.date},
            (SELECT ${personsArrayJsonSql} FROM ${personsTable} WHERE ${personsTable.id} = ANY(${resultsTable.personIds})) AS persons,
            attempts_data.attempt->>'result' AS result,
            CAST(attempts_data.attempt->>'memo' AS INTEGER) AS memo,
            ${resultsTable.attempts},
            CASE WHEN ${resultsTable.competitionId} IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'competitionId', ${contestsTable.competitionId},
                'shortName', ${contestsTable.shortName},
                'type', ${contestsTable.type},
                'regionCode', ${contestsTable.regionCode}
              )
            ELSE NULL END AS contest,
            ${resultsTable.videoLink},
            ${resultsTable.discussionLink}
          FROM ${resultsTable}
            LEFT JOIN ${contestsTable}
              ON ${resultsTable.organizationId} = ${contestsTable.organizationId}
                AND ${resultsTable.competitionId} = ${contestsTable.competitionId},
            UNNEST(${resultsTable.attempts}) WITH ORDINALITY AS attempts_data(attempt, attempt_number)
          WHERE ${resultsTable.organizationId} = ${organizationId}
            AND ${resultsTable.approved} IS TRUE
            AND ${resultsTable.eventId} = ${event.eventId}
            ${recordCategoryCondition}
            AND CAST(attempts_data.attempt->>'result' AS BIGINT) > 0
            ${regionCondition}
          ORDER BY ranking, ${resultsTable.date}
        )
        SELECT * FROM rankings
        WHERE rankings.ranking <= ${topN}
      `)
      .then(mapRankingsData);
  }
  // Top averages
  else {
    rankings = await db
      .execute(sql`
        WITH rankings AS (
          SELECT
            CAST(${resultsTable.id} AS TEXT) AS ranking_id,
            RANK() OVER (ORDER BY ${resultsTable.average} ${sortDirection} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ranking,
            ${resultsTable.date},
            (SELECT ${personsArrayJsonSql} FROM ${personsTable} WHERE ${personsTable.id} = ANY(${resultsTable.personIds})) AS persons,
            ${resultsTable.average} AS result,
            ${resultsTable.attempts},
            CASE WHEN ${resultsTable.competitionId} IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'competitionId', ${contestsTable.competitionId},
                'shortName', ${contestsTable.shortName},
                'type', ${contestsTable.type},
                'regionCode', ${contestsTable.regionCode}
              )
            ELSE NULL END AS contest,
            ${resultsTable.videoLink},
            ${resultsTable.discussionLink}
          FROM ${resultsTable}
            LEFT JOIN ${contestsTable}
              ON ${resultsTable.organizationId} = ${contestsTable.organizationId}
                AND ${resultsTable.competitionId} = ${contestsTable.competitionId}
          WHERE ${resultsTable.organizationId} = ${organizationId}
            AND ${resultsTable.approved} IS TRUE
            AND ${resultsTable.eventId} = ${event.eventId}
            ${recordCategoryCondition}
            AND ${resultsTable.average} > 0
            ${numberOfAttemptsCondition}
            ${regionCondition}
          ORDER BY ${resultsTable.average} ${sortDirection}, ${resultsTable.date}
        )
        SELECT * FROM rankings
        WHERE rankings.ranking <= ${topN}
      `)
      .then(mapRankingsData);
  }

  return rankings!;
}

/**
 * Approves a list of persons, while checking for exact name and country matches with WCA competitors (if the person has a WCA ID).
 *
 * @param db - The tx object from a Drizzle transaction.
 * @param organizationId - Not strictly necessary, but adds an extra safety check.
 * @param personsToBeApproved - Array of persons to be approved.
 */
export async function approvePersons(
  db: DbTransactionType,
  organizationId: string,
  personsToBeApproved: Pick<SelectPerson, "id" | "name" | "localizedName" | "regionCode" | "wcaId">[],
) {
  const matchedPersonWcaIds: { name: string; wcaId: string }[] = [];

  for (const person of personsToBeApproved) {
    if (!person.wcaId) {
      const matchedPersonWcaId = await getPersonExactMatchWcaId(person);
      if (matchedPersonWcaId) matchedPersonWcaIds.push({ name: person.name, wcaId: matchedPersonWcaId });
    }
  }

  if (matchedPersonWcaIds.length > 0) {
    const matchesSummary = matchedPersonWcaIds
      .map((p) => `${p.name} has an exact name and country match with the WCA competitor with WCA ID ${p.wcaId}.`)
      .join("\n");
    throw new RrActionError(`${matchesSummary}\nResolve this manually on the manage competitors page and try again.`);
  }

  const personIds = personsToBeApproved.map((p) => p.id);
  await db
    .update(personsTable)
    .set({ approved: true })
    .where(and(eq(personsTable.organizationId, organizationId), inArray(personsTable.id, personIds)));
}

export async function getPersonExactMatchWcaId(
  person: Pick<SelectPerson, "name" | "localizedName" | "regionCode">,
  ignoredWcaMatches: string[] = [],
): Promise<string | null> {
  const res = await fetch(`${C.wcaV0ApiBaseUrl}/search/users?persons_table=true&q=${person.name}`);

  if (res.ok) {
    const { result: wcaPersons } = await res.json();

    for (const wcaPerson of wcaPersons) {
      const { name, localizedName } = getNameAndLocalizedName(wcaPerson.name);

      if (
        !ignoredWcaMatches.includes(wcaPerson.wca_id) &&
        name === person.name &&
        localizedName === person.localizedName &&
        wcaPerson.country_iso2 === person.regionCode
      ) {
        return wcaPerson.wca_id;
      }
    }

    return null;
  } else {
    throw new RrActionError("Error while fetching person matches from the WCA");
  }
}

export async function validateMaxMonthlyContests(organization: Pick<OrganizationDetails, "id" | "subscription">) {
  const contestsCreatedLastMonth = (
    await db.query.contests.findMany({
      columns: { id: true },
      where: {
        organizationId: organization.id,
        state: { ne: "removed" },
        createdAt: { gt: addMonths(new Date(), -1) },
      },
    })
  ).length;

  if (organization.subscription && contestsCreatedLastMonth >= organization.subscription.limits.monthlyContests) {
    throw new RrActionError(
      C.message.maxMonthlyContestsReached + (IS_RR_INSTANCE ? ". Consider upgrading to a higher plan." : ""),
    );
  }
}

export async function validateMaxTotalCompetitors(organization: Pick<OrganizationDetails, "id" | "subscription">) {
  const totalPersons = (
    await db.query.persons.findMany({ columns: { id: true }, where: { organizationId: organization.id } })
  ).length;

  if (organization.subscription && totalPersons >= organization.subscription.limits.competitors) {
    throw new RrActionError(
      C.message.maxCompetitorsReached + (IS_RR_INSTANCE ? ". Consider upgrading to a higher plan." : ""),
    );
  }
}

export async function getOrCreatePersonByWcaId(
  wcaId: string,
  {
    creatorUserId,
    createdExternally = false,
    organization,
  }: {
    creatorUserId: string;
    createdExternally?: boolean;
    organization: Pick<OrganizationDetails, "id" | "subscription">;
  },
): Promise<GetOrCreatePersonObject> {
  const spaceType = await getSettingFromDb({ key: "space-type", organizationId: organization.id });
  if (spaceType !== "speedcubing")
    throw new RrActionError("Persons can only be added by WCA ID on spaces with the type Speedcubing");

  const [person] = await db
    .select(personsPublicCols)
    .from(personsTable)
    .where(and(eq(personsTable.organizationId, organization.id), eq(personsTable.wcaId, wcaId)))
    .limit(1);
  if (person) return { person, isNew: false };

  const wcaPerson = await fetchWcaPerson(wcaId);
  if (!wcaPerson) throw new RrActionError(`Person with WCA ID ${wcaId} not found in the WCA API`);

  logMessage("RR0019", `Creating person with name ${wcaPerson.name} and WCA ID ${wcaId} (directly via WCA ID)`);

  await validateMaxTotalCompetitors(organization);

  const [createdPerson] = await db
    .insert(personsTable)
    .values({
      ...wcaPerson,
      organizationId: organization.id,
      approved: true,
      createdBy: creatorUserId,
      createdExternally,
    })
    .returning();

  return { person: createdPerson, isNew: true };
}

export async function getPersonsForExternalDeviceDataEntry(
  { personId, wcaId }: Pick<EnterAttemptPayloadDto, "personId" | "wcaId">,
  {
    creatorUserId,
    organization,
  }: { creatorUserId: string; organization: Pick<OrganizationDetails, "id" | "subscription"> },
): Promise<PersonResponse[]> {
  if (wcaId) {
    const wcaIds = wcaId.split(",");
    const persons: PersonResponse[] = [];

    for (const wid of wcaIds) {
      const { person } = await getOrCreatePersonByWcaId(wid.toUpperCase(), {
        creatorUserId,
        createdExternally: true,
        organization,
      });
      persons.push(person);
    }

    return persons;
  } else if (typeof personId === "number") {
    const person = await db.query.persons.findFirst({ where: { organizationId: organization.id, id: personId } });
    if (!person) throw new Error(`Person with ID ${personId} not found`);
    return [person];
  } else {
    const personIds: number[] = personId!.split(",").map((part) => parseInt(part, 10));
    const persons = await db.query.persons.findMany({
      where: { organizationId: organization.id, id: { in: personIds } },
    });

    const personsInPreservedOrder: PersonResponse[] = [];
    for (const pid of personIds) {
      const person = persons.find((p) => p.id === pid);
      if (!person) throw new Error(`Person with ID ${pid} not found`);
      personsInPreservedOrder.push(person);
    }

    return personsInPreservedOrder;
  }
}

type GetSettingFromDbBaseParams = { key: SettingKey; organizationId: string | null };
export async function getSettingFromDb(params: GetSettingFromDbBaseParams & { optional?: false }): Promise<string>;
export async function getSettingFromDb(params: GetSettingFromDbBaseParams & { optional: true }): Promise<string | null>;
export async function getSettingFromDb({
  key,
  organizationId,
  optional = false,
}: GetSettingFromDbBaseParams & { optional?: boolean }): Promise<string | null> {
  const setting = await db.query.settings.findFirst({
    columns: { value: true },
    where: { key, organizationId: organizationId || { isNull: true } },
  });

  if (!setting?.value) {
    if (optional) return null;
    throw new Error(`Setting "${key}" ${setting ? "has no value" : "not found"}`);
  }

  return setting.value;
}

export async function getMemberRequestDetails({
  member,
}: {
  member: Pick<typeof membersTable.$inferSelect, "id" | "organizationId" | "userId">;
}): Promise<MemberRequestDetails> {
  const [fullMemberRequest, ownCreatedPersons] = await Promise.all([
    db.query.memberRequests.findFirst({
      with: {
        user: { columns: { id: true, name: true, email: true } },
        requestedPerson: {
          columns: { id: true, name: true, localizedName: true, regionCode: true, wcaId: true, approved: true },
        },
      },
      where: { memberId: member.id },
    }) satisfies Promise<FullMemberRequest | undefined>,
    db.query.persons.findMany({
      columns: { id: true },
      // This logic is consistent with updatePersonSF()
      where: {
        organizationId: member.organizationId,
        createdBy: member.userId,
        approved: false,
        wcaId: { isNull: true },
      },
    }),
  ]);

  if (fullMemberRequest && ownCreatedPersons.length > 1) {
    throw new RrActionError(
      "You have somehow created more than one competitor profile. Please contact the admin team to assign your profile.",
    );
  }

  return { memberRequest: fullMemberRequest ?? null, ownRequestedPersonId: ownCreatedPersons.at(0)?.id };
}

export async function getCreators({
  organizationId,
  userIds,
  includeEmails,
}: {
  organizationId: string;
  userIds: string[];
  includeEmails: boolean;
}): Promise<Creator[]> {
  if (userIds.length === 0) return [];

  return await db
    .select({
      userId: membersTable.userId,
      name: usersTable.name,
      ...(includeEmails ? { email: usersTable.email } : undefined),
      person: {
        id: personsTable.id,
        name: personsTable.name,
        localizedName: personsTable.localizedName,
        regionCode: personsTable.regionCode,
        wcaId: personsTable.wcaId,
      },
    })
    .from(membersTable)
    .innerJoin(usersTable, eq(membersTable.userId, usersTable.id))
    .leftJoin(personsTable, eq(membersTable.personId, personsTable.id))
    .where(and(eq(membersTable.organizationId, organizationId), inArray(membersTable.userId, userIds)));
}

export async function getEventCategories({ organizationId }: { organizationId: string }) {
  return await db
    .select(eventCategoriesPublicCols)
    .from(eventCategoriesTable)
    .where(eq(eventCategoriesTable.organizationId, organizationId))
    .orderBy(eventCategoriesTable.rank);
}

export async function getEvents(params: {
  organizationId: string;
  eventIds?: string[];
  includeHiddenAndRemoved?: boolean;
  columns?: "all";
}): Promise<FullEvent[]>;
export async function getEvents(params: {
  organizationId: string;
  eventIds?: string[];
  includeHiddenAndRemoved?: boolean;
  columns?: "public+rules";
}): Promise<(EventResponseWithCategory & { rule: SelectEvent["rule"] })[]>;
export async function getEvents({
  organizationId,
  eventIds,
  columns = "public",
  includeHiddenAndRemoved = false,
}: {
  organizationId: string;
  eventIds?: string[];
  includeHiddenAndRemoved?: boolean;
  columns?: "public" | "public+rules" | "all";
}): Promise<EventResponseWithCategory[]> {
  return await db
    .select({
      ...(columns === "all"
        ? getColumns(eventsTable)
        : columns === "public+rules"
          ? { ...eventsPublicCols, rule: eventsTable.rule }
          : eventsPublicCols),
      category: {
        categoryId: eventCategoriesTable.categoryId,
        name: eventCategoriesTable.name,
        shortName: eventCategoriesTable.shortName,
        color: eventCategoriesTable.color,
        hidden: eventCategoriesTable.hidden,
        videoBased: eventCategoriesTable.videoBased,
      },
    })
    .from(eventsTable)
    .innerJoin(eventCategoriesTable, eq(eventsTable.categoryId, eventCategoriesTable.id))
    .where(
      and(
        eq(eventsTable.organizationId, organizationId),
        eventIds ? inArray(eventsTable.eventId, eventIds) : undefined,
        includeHiddenAndRemoved ? undefined : eq(eventCategoriesTable.hidden, false),
        includeHiddenAndRemoved ? undefined : eq(eventsTable.hidden, false),
      ),
    )
    .orderBy(eventsTable.rank);
}

export async function getVideoBasedEvents(organizationId: string) {
  const events = await db
    .select({
      ...eventsPublicCols,
      category: {
        categoryId: eventCategoriesTable.categoryId,
        name: eventCategoriesTable.name,
        shortName: eventCategoriesTable.shortName,
        color: eventCategoriesTable.color,
        hidden: eventCategoriesTable.hidden,
        videoBased: eventCategoriesTable.videoBased,
      },
    })
    .from(eventsTable)
    .innerJoin(eventCategoriesTable, eq(eventsTable.categoryId, eventCategoriesTable.id))
    .where(
      and(
        eq(eventsTable.organizationId, organizationId),
        eq(eventsTable.submissionsAllowed, true),
        eq(eventCategoriesTable.hidden, false),
      ),
    )
    .orderBy(eventsTable.rank);

  return events;
}

export async function getRegions(organizationId: string): Promise<RegionResponse[]> {
  return await db
    .select(regionsPublicCols)
    .from(regionsTable)
    .where(eq(regionsTable.organizationId, organizationId))
    .orderBy(regionsTable.name);
}

export async function getBlogPosts(
  organizationId: string,
  { postId, limit }: { postId?: string; limit?: never } | { postId?: never; limit?: number } = {},
): Promise<(PostResponse & { authorName?: string | null })[]> {
  const query = db
    .select({ ...postsPublicCols, authorName: personsTable.name })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.createdBy, usersTable.id))
    .leftJoin(
      membersTable,
      and(eq(membersTable.organizationId, organizationId), eq(usersTable.id, membersTable.userId)),
    )
    .leftJoin(personsTable, eq(membersTable.personId, personsTable.id));
  const organizationFilter = eq(postsTable.organizationId, organizationId);

  if (postId) return await query.where(and(organizationFilter, eq(postsTable.postId, postId)));

  if (limit) return await query.where(organizationFilter).limit(limit).orderBy(desc(postsTable.date));

  return await query.where(organizationFilter).orderBy(desc(postsTable.date));
}

export function getRecordConfigsSet({
  organizationId,
  category,
  prefix,
}: {
  organizationId: string;
  category: RecordCategory;
  prefix: string;
}): InsertRecordConfig[] {
  const recordConfigs: InsertRecordConfig[] = [];

  for (let i = 0; i < C.defaultRecordTypeValues.length; i++) {
    const recordTypeId = C.defaultRecordTypeValues[i];
    recordConfigs.push({
      organizationId,
      recordTypeId,
      category,
      label: prefix + recordTypeId,
      rank: (i + 1) * 10 + (category === "online" ? 2000 : category === "meetups" ? 1000 : 0),
      color: recordTypeId === "WR" ? C.color.danger : recordTypeId === "NR" ? C.color.success : C.color.warning,
    });
  }

  return recordConfigs;
}

export function getOrgSubscription(
  subscription: { plan: string } | null,
): { plan: "basic" | "premium"; limits: typeof rrBasicLimits } | undefined {
  return subscription
    ? {
        plan: subscription.plan as "basic" | "premium",
        limits: subscription.plan === "premium" ? rrPremiumLimits : rrBasicLimits,
      }
    : undefined;
}

export async function getEnabledRecordCategories({
  organizationId,
}: {
  organizationId: string;
}): Promise<RecordCategory[]> {
  const [contestTypesSetting, videoBasedResultsEnabled] = await Promise.all([
    getSettingFromDb({ organizationId, key: "contest-types" }),
    getSettingFromDb({ organizationId, key: "video-based-results-enabled" }),
  ]);
  const contestTypes = contestTypesSetting.split(",") as ContestType[];
  const enabledRecordCategories: RecordCategory[] = [];

  if (contestTypes.includes("comp") || contestTypes.includes("wca-comp")) enabledRecordCategories.push("competitions");
  if (contestTypes.includes("meetup")) enabledRecordCategories.push("meetups");
  if (contestTypes.includes("online") || videoBasedResultsEnabled === "true") enabledRecordCategories.push("online");

  return enabledRecordCategories;
}
