"use server";

import { endOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { and, arrayContains, desc, eq, gte, ilike, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { find as findTimezone } from "geo-tz";
import z from "zod";
import { ModDashboardFiltersValidator } from "~/app/[slug]/mod/ModDashboardFilters.ts";
import { C, IS_CUBING_CONTESTS_INSTANCE } from "~/helpers/constants.ts";
import { roundFormats } from "~/helpers/roundFormats.ts";
import type { Schedule } from "~/helpers/types/Schedule.ts";
import {
  getDateOnly,
  getMaxAllowedRounds,
  getMemberControlsContest,
  getNameAndLocalizedName,
  getResultProceeds,
  getSimplifiedString,
} from "~/helpers/utility-functions.ts";
import { type ContestDto, ContestValidator } from "~/helpers/validators/Contest.ts";
import { CoordinatesValidator } from "~/helpers/validators/Coordinates.ts";
import { type RoundDto, RoundValidator } from "~/helpers/validators/Round.ts";
import { auth } from "~/server/auth.ts";
import { apikeysTable } from "~/server/db/schema/auth-schema.ts";
import { type PersonResponse, personsPublicCols, personsTable, type SelectPerson } from "~/server/db/schema/persons.ts";
import type { SelectRegion } from "~/server/db/schema/regions.ts";
import { resultsTable, type SelectResult } from "~/server/db/schema/results.ts";
import { type RoundResponse, roundsPublicCols, roundsTable, type SelectRound } from "~/server/db/schema/rounds.ts";
import {
  sendContestApprovedEmail,
  sendContestFinishedEmail,
  sendContestPublishedEmail,
  sendContestSubmittedEmail,
  sendEmail,
} from "~/server/email/mailer.ts";
import { getContestParticipantIds } from "~/server/server-only-functions/contests-functions.ts";
import {
  approvePersons,
  getEvents,
  getSettingFromDb,
  logMessage,
  validateMaxMonthlyContests,
} from "~/server/server-only-functions/server-only-functions.ts";
import { type DbTransactionType, db } from "../db/provider.ts";
import {
  type ContestResponse,
  contestsPublicCols,
  type SelectContest,
  contestsTable as table,
} from "../db/schema/contests.ts";
import { actionClient, RrActionError } from "../safe-action.ts";

const SELECT_AN_EVENT_MSG = "Please select at least one event";

export const getModContestsSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { modDashboard: ["view"] } } })
  .inputSchema(ModDashboardFiltersValidator)
  .action<{ contests: ContestResponse[]; organizerPerson?: PersonResponse }>(
    async ({ parsedInput: { organizerPersonId, state }, ctx: { session, httpHeaders } }) => {
      const queryFilters: any[] = [eq(table.organizationId, session.organization!.id)];

      const { success: canApproveContests } = await auth.api.hasPermission({
        body: { permissions: { competitions: ["approve"], meetups: ["approve"] } },
        headers: httpHeaders,
      });

      // If it's a moderator, only get their own contests
      if (!canApproveContests) {
        const msg = "Your competitor profile must be tied to your member profile before you can use moderator features";
        if (!session.member!.personId) throw new RrActionError(msg);

        const [person] = await db
          .select({ id: personsTable.id })
          .from(personsTable)
          .where(eq(personsTable.id, session.member!.personId));

        if (!person) throw new RrActionError(msg);
        queryFilters.push(arrayContains(table.organizerIds, [person.id]));
      }

      let organizerPerson: PersonResponse | undefined;
      if (organizerPersonId) {
        const [person] = await db
          .select(personsPublicCols)
          .from(personsTable)
          .where(
            and(eq(personsTable.organizationId, session.organization!.id), eq(personsTable.id, organizerPersonId)),
          );

        if (!person) throw new RrActionError(`Person with ID ${organizerPersonId} not found`);
        queryFilters.push(arrayContains(table.organizerIds, [person.id]));
        organizerPerson = person;
      }

      if (state) {
        switch (state) {
          case "pending":
            {
              const today = getDateOnly(new Date())!;
              queryFilters.push(
                or(
                  and(gte(table.endDate, today), inArray(table.state, ["created", "finished"])),
                  and(lt(table.endDate, today), notInArray(table.state, ["published", "removed"])),
                ),
              );
            }
            break;
          default:
            queryFilters.push(eq(table.state, state));
            break;
        }
      }

      const contests = await db
        .select(contestsPublicCols)
        .from(table)
        .where(and(...queryFilters))
        .orderBy(desc(table.startDate));

      return { contests, organizerPerson };
    },
  );

export const getContestsByNameSF = actionClient
  .metadata({ auth: { useOrganization: true } })
  .inputSchema(
    z.strictObject({
      search: z.string().max(100),
    }),
  )
  .action<ContestResponse[]>(async ({ parsedInput: { search }, ctx: { session } }) => {
    const simplifiedParts = getSimplifiedString(search)
      .split(" ")
      .filter((part) => part !== "")
      .map((part) => `%${part}%`);
    const nameQuery = and(...simplifiedParts.map((part) => ilike(sql`UNACCENT(${table.name})`, part)));
    const shortNameQuery = and(...simplifiedParts.map((part) => ilike(sql`UNACCENT(${table.shortName})`, part)));
    const competitionIdQuery = ilike(table.competitionId, search.trim());

    return await db
      .select(contestsPublicCols)
      .from(table)
      .where(and(eq(table.organizationId, session.organization!.id), or(nameQuery, shortNameQuery, competitionIdQuery)))
      .orderBy(desc(table.startDate))
      .limit(C.maxSearchMatches);
  });

export const getTimeZoneFromCoordsSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["create"], meetups: ["create"] } } })
  .inputSchema(CoordinatesValidator)
  .action<string>(async ({ parsedInput: { latitude, longitude } }) => {
    const timezone = findTimezone(latitude, longitude).at(0);

    if (!timezone) throw new RrActionError(`Time zone for coordinates ${latitude}, ${longitude} not found`);

    return timezone;
  });

export const createContestSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["create"], meetups: ["create"] } } })
  .inputSchema(
    z.strictObject({
      newContestDto: ContestValidator,
      rounds: z.array(RoundValidator).nonempty({ error: SELECT_AN_EVENT_MSG }),
    }),
  )
  .action(async ({ parsedInput: { newContestDto, rounds }, ctx: { session, httpHeaders } }) => {
    logMessage(
      "RR0005",
      `Creating contest ${newContestDto.competitionId} for organization ${session.organization!.name}`,
    );

    const sameNameContest = await db.query.contests.findFirst({
      where: { organizationId: session.organization!.id, name: newContestDto.name, state: { NOT: "removed" } },
    });
    if (sameNameContest) throw new RrActionError(`A contest with the name ${newContestDto.name} already exists`);
    const sameShortNameContest = await db.query.contests.findFirst({
      where: {
        organizationId: session.organization!.id,
        shortName: newContestDto.shortName,
        state: { NOT: "removed" },
      },
    });
    if (sameShortNameContest)
      throw new RrActionError(`A contest with the short name ${newContestDto.shortName} already exists`);

    await validateMaxMonthlyContests(session.organization!);

    const { success: canApprove } = await auth.api.hasPermission({
      headers: httpHeaders,
      body: { permissions: { competitions: ["approve"], meetups: ["approve"] } },
    });

    const { region } = await validateAndCleanUpContest(
      session.organization!.id,
      newContestDto,
      rounds,
      session.member!.personId!,
      canApprove,
    );

    const creatorPerson = await db.query.persons.findFirst({
      columns: { name: true },
      where: { id: session.member!.personId! },
    });
    if (!creatorPerson) throw new RrActionError("Contest creator's competitor profile not found");

    const organizerMembers = await db.query.members.findMany({
      with: { user: { columns: { email: true } } },
      where: { personId: { in: newContestDto.organizerIds } },
    });

    const createdContest = await db.transaction(async (tx) => {
      const [createdContest] = await tx
        .insert(table)
        .values({ ...newContestDto, organizationId: session.organization!.id, createdBy: session.user.id })
        .returning();

      await createRounds({ tx, rounds, organizationId: session.organization!.id });

      return createdContest;
    });

    // Notify the organizers and admins
    sendContestSubmittedEmail(
      organizerMembers.map((m) => m.user.email),
      {
        contest: createdContest,
        creator: creatorPerson.name,
        regionName: region.type === "meta-region" ? undefined : region.name,
        organization: session.organization!,
      },
    );
  });

export const approveContestSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["approve"], meetups: ["approve"] } } })
  .inputSchema(
    z.strictObject({
      competitionId: z.string().nonempty(),
    }),
  )
  .action(async ({ parsedInput: { competitionId }, ctx: { session } }) => {
    logMessage("RR0006", `Approving contest ${competitionId}`);

    const contest = await db.query.contests.findFirst({
      with: { creator: { columns: { email: true } } },
      columns: {
        id: true,
        competitionId: true,
        name: true,
        shortName: true,
        state: true,
        organizerIds: true,
        adminNotes: true,
        createdBy: true,
      },
      where: { organizationId: session.organization!.id, competitionId },
    });

    if (!contest) throw new RrActionError(`Contest with ID ${competitionId} not found`);
    if (contest.state !== "created") throw new RrActionError("Contest has already been approved");
    if (contest.adminNotes) {
      throw new RrActionError(
        `Please resolve the issues outlined in the admin notes and clear them before approving:\n\n${contest.adminNotes}`,
      );
    }

    await db.transaction(async (tx) => {
      await tx.update(table).set({ state: "approved" }).where(eq(table.id, contest.id));

      // Approve organizer persons
      await tx.update(personsTable).set({ approved: true }).where(inArray(personsTable.id, contest.organizerIds));
    });

    if (contest.creator)
      sendContestApprovedEmail(contest.creator.email, { contest, organization: session.organization! });
  });

export const finishContestSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["create"], meetups: ["create"] } } })
  .inputSchema(
    z.strictObject({
      competitionId: z.string().nonempty(),
    }),
  )
  .action(async ({ parsedInput: { competitionId }, ctx: { session } }) => {
    logMessage("RR0007", `Finishing contest ${competitionId}`);

    const organizationId = session.organization!.id;
    const contest = await db.query.contests.findFirst({
      columns: {
        id: true,
        competitionId: true,
        name: true,
        shortName: true,
        type: true,
        state: true,
        organizerIds: true,
        participants: true,
        createdBy: true,
      },
      where: { organizationId, competitionId },
    });
    if (!contest) throw new RrActionError(`Contest with ID ${competitionId} not found`);

    if (!getMemberControlsContest(session.member!, contest))
      throw new RrActionError("You do not have access rights for this contest");
    if (contest.state !== "ongoing") throw new RrActionError("Contest cannot be finished");
    if (contest.participants === 0) throw new RrActionError("This contest doesn't have any results");
    if (
      IS_CUBING_CONTESTS_INSTANCE &&
      contest.type !== "wca-comp" &&
      contest.participants < C.minCompetitorsForNonWca
    ) {
      throw new RrActionError(
        `A meetup or unofficial competition may not have fewer than ${C.minCompetitorsForNonWca} competitors`,
      );
    }

    const [rounds, results, organizerMembers] = await Promise.all([
      db.query.rounds.findMany({ where: { organizationId, competitionId } }),
      db.query.results.findMany({ where: { organizationId, competitionId } }),
      db.query.members.findMany({
        with: { user: { columns: { email: true } } },
        where: { personId: { in: contest.organizerIds } },
      }),
    ]);

    // Check there are no rounds with too few results
    for (const { id, eventId, roundNumber } of rounds) {
      const roundResults = results.filter((r) => r.roundId === id);

      if (roundResults.length === 0 || (roundNumber > 1 && roundResults.length < C.minProceedNumber)) {
        const event = (await db.query.events.findFirst({
          columns: { name: true },
          where: { organizationId, eventId },
        }))!;

        if (roundResults.length === 0) {
          throw new RrActionError(`${event.name} round ${roundNumber} has no results`);
        } else {
          throw new RrActionError(
            `${event.name} round ${roundNumber} has fewer than ${C.minProceedNumber} results (see WCA regulation 9q+)`,
          );
        }
      }
    }

    // Check there are no incomplete results
    const incompleteResult = results.find((r) => r.attempts.some((a) => a.result === 0));
    if (incompleteResult) {
      const event = (await db.query.events.findFirst({
        columns: { name: true },
        where: { organizationId, eventId: incompleteResult.eventId },
      }))!;
      const round = rounds.find((r) => r.id === incompleteResult.roundId)!;
      throw new RrActionError(`This contest has an unentered attempt in ${event.name} round ${round.roundNumber}`);
    }

    // If there are no issues, finish the contest and close all rounds
    await db.transaction(async (tx) => {
      await tx.update(table).set({ state: "finished" }).where(eq(table.id, contest.id));

      await tx
        .update(roundsTable)
        .set({ open: false })
        .where(and(eq(roundsTable.organizationId, organizationId), eq(roundsTable.competitionId, competitionId)));
    });

    sendContestFinishedEmail(
      organizerMembers.map((m) => m.user.email),
      { contest, organization: session.organization! },
    );
  });

export const unfinishContestSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["publish"], meetups: ["publish"] } } })
  .inputSchema(
    z.strictObject({
      competitionId: z.string().nonempty(),
    }),
  )
  .action(async ({ parsedInput: { competitionId }, ctx: { session } }) => {
    logMessage("RR0008", `Un-finishing contest ${competitionId}`);

    const organizationId = session.organization!.id;
    const contest = await db.query.contests.findFirst({
      columns: { id: true, name: true, shortName: true, state: true },
      where: { organizationId, competitionId },
    });
    if (!contest) throw new RrActionError(`Contest with ID ${competitionId} not found`);
    if (!["finished", "published"].includes(contest.state))
      throw new RrActionError("Only finished and published contests can be un-finished");

    // Set contest state back to ongoing and re-open all final rounds
    await db.transaction(async (tx) => {
      await tx.update(table).set({ state: "ongoing" }).where(eq(table.id, contest.id));

      await tx
        .update(roundsTable)
        .set({ open: true })
        .where(
          and(
            eq(roundsTable.organizationId, organizationId),
            eq(roundsTable.competitionId, competitionId),
            eq(roundsTable.roundTypeId, "f"),
          ),
        );
    });

    sendEmail(
      session.organization!.metadata.contactEmail,
      `Contest un-finished: ${contest.shortName}`,
      `Contest ${contest.name} has been un-finished by ${session.user.name}. This may have been done to correct some of the data.`,
    );
  });

export const publishContestSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["publish"], meetups: ["publish"] } } })
  .inputSchema(
    z.strictObject({
      competitionId: z.string().nonempty(),
    }),
  )
  .action(async ({ parsedInput: { competitionId }, ctx: { session } }) => {
    logMessage("RR0009", `Publishing contest ${competitionId}`);

    const organizationId = session.organization!.id;
    const contest = await db.query.contests.findFirst({
      with: { creator: { columns: { email: true } } },
      columns: {
        id: true,
        competitionId: true,
        name: true,
        shortName: true,
        type: true,
        state: true,
        adminNotes: true,
        createdBy: true,
      },
      where: { organizationId, competitionId },
    });
    if (!contest) throw new RrActionError(`Contest with ID ${competitionId} not found`);
    if (contest.state !== "finished") throw new RrActionError("Contest cannot be published");
    if (contest.adminNotes) {
      throw new RrActionError(
        `Please resolve the issues outlined in the admin notes and clear them before publishing:\n\n${contest.adminNotes}`,
      );
    }

    const wcaPersons: { name: string; wcaId: string; countryIso2: string }[] = [];

    if (contest.type === "wca-comp") {
      const res = await fetch(`${C.wcaV0ApiBaseUrl}/competitions/${competitionId}/results`);
      const wcaCompResultsData = await res.json();
      if (!wcaCompResultsData || wcaCompResultsData.length === 0) {
        throw new RrActionError(
          "You must wait until the results have been published on the WCA website before publishing the contest",
        );
      }

      for (const result of wcaCompResultsData) {
        if (!wcaPersons.some((p) => p.wcaId === result.wca_id))
          wcaPersons.push({ name: result.name, wcaId: result.wca_id, countryIso2: result.country_iso2 });
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(table).set({ state: "published" }).where(eq(table.id, contest.id));

      await tx
        .update(resultsTable)
        .set({ approved: true })
        .where(
          and(eq(resultsTable.organizationId, session.organization!.id), eq(resultsTable.competitionId, competitionId)),
        );

      const participantIds = await getContestParticipantIds({
        tx,
        organizationId: session.organization!.id,
        competitionId,
      });
      const personsToBeApproved = await tx.query.persons.findMany({
        where: { id: { in: participantIds }, approved: false },
      });

      if (personsToBeApproved.length > 0) {
        logMessage("RR0023", `Approving participants from ${contest.name}`);

        if (contest.type === "wca-comp") {
          const unmatchedPersonNames: string[] = [];

          for (const person of personsToBeApproved) {
            const updatePersonObject: Partial<SelectPerson> = { approved: true };

            if (!person.wcaId) {
              for (const wcaPerson of wcaPersons) {
                const { name, localizedName } = getNameAndLocalizedName(wcaPerson.name);

                if (name === person.name && wcaPerson.countryIso2 === person.regionCode) {
                  if (updatePersonObject.wcaId) {
                    throw new RrActionError(
                      `Multiple matches found while assigning WCA ID for ${name}. Resolve this manually and publish the contest again.`,
                    );
                  }

                  updatePersonObject.wcaId = wcaPerson.wcaId;
                  if (localizedName) updatePersonObject.localizedName = localizedName;
                }
              }

              if (!updatePersonObject.wcaId) unmatchedPersonNames.push(person.name);
            }

            await tx.update(personsTable).set(updatePersonObject).where(eq(personsTable.id, person.id));
          }

          if (unmatchedPersonNames.length > 0)
            throw new RrActionError(
              `No matches found while assigning WCA ID for the following competitors: ${unmatchedPersonNames.join(", ")}. Resolve this manually and publish the contest again.`,
            );
        } else {
          await approvePersons(tx, session.organization!.id, personsToBeApproved);
        }
      }
    });

    if (contest.creator)
      sendContestPublishedEmail(contest.creator.email, { contest, organization: session.organization! });
  });

export const updateContestSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["update"], meetups: ["update"] } } })
  .inputSchema(
    z.strictObject({
      originalCompetitionId: z.string().nonempty(),
      newContestDto: ContestValidator,
      rounds: z.array(RoundValidator).nonempty({ error: SELECT_AN_EVENT_MSG }),
    }),
  )
  .action(async ({ parsedInput: { originalCompetitionId, newContestDto, rounds }, ctx: { session, httpHeaders } }) => {
    logMessage("RR0010", `Updating contest ${originalCompetitionId}`);

    const organizationId = session.organization!.id;
    const { success: canApprove } = await auth.api.hasPermission({
      headers: httpHeaders,
      body: { permissions: { competitions: ["approve"], meetups: ["approve"] } },
    });

    const [contest, prevRounds, results] = await Promise.all([
      db.query.contests.findFirst({
        columns: { id: true, competitionId: true, type: true, state: true, organizerIds: true, schedule: true },
        where: { organizationId, competitionId: originalCompetitionId },
      }),
      db.query.rounds.findMany({ where: { organizationId, competitionId: originalCompetitionId } }),
      db.query.results.findMany({ where: { organizationId, competitionId: originalCompetitionId } }),
    ]);

    if (!contest) throw new RrActionError(`Contest with ID ${originalCompetitionId} not found`);
    if (!getMemberControlsContest(session.member!, contest))
      throw new RrActionError("You do not have access rights for this contest");
    if (!["created", "approved", "ongoing", "finished"].includes(contest.state))
      throw new RrActionError("Published contests cannot be edited");

    await validateAndCleanUpContest(organizationId, newContestDto, rounds, session.member!.personId!, canApprove);

    await db.transaction(async (tx) => {
      const updateContestObject: Partial<SelectContest> = {
        organizerIds: newContestDto.organizerIds,
        contact: newContestDto.contact,
        description: newContestDto.description,
      };

      if (canApprove || contest.state === "created") {
        if (newContestDto.competitionId !== originalCompetitionId)
          updateContestObject.competitionId = newContestDto.competitionId;

        updateContestObject.name = newContestDto.name;
        updateContestObject.shortName = newContestDto.shortName;
        updateContestObject.city = newContestDto.city;
        updateContestObject.venue = newContestDto.venue;
        updateContestObject.address = newContestDto.address;
        updateContestObject.latitudeMicrodegrees = newContestDto.latitudeMicrodegrees;
        updateContestObject.longitudeMicrodegrees = newContestDto.longitudeMicrodegrees;
        updateContestObject.competitorLimit = newContestDto.competitorLimit;
      }

      // Even admins aren't allowed to edit the date after a contest has been approved
      if (contest.state === "created") {
        updateContestObject.startDate = newContestDto.startDate;
        updateContestObject.endDate = newContestDto.endDate;
      }

      if (contest.type === "meetup") {
        updateContestObject.startTime = newContestDto.startTime;
        updateContestObject.timezone = newContestDto.timezone;
      } else {
        updateContestObject.schedule = await getUpdatedSchedule(contest.schedule!, newContestDto.schedule!);
      }

      await updateRounds(prevRounds, rounds, results, {
        tx,
        canAddNewEvents: canApprove || contest.state === "created",
        organizationId,
      });

      if (updateContestObject.competitionId) {
        await tx.execute(
          sql`UPDATE ${apikeysTable}
              SET metadata = JSONB_SET("metadata"::jsonb, '{competitionId}', '"${sql.raw(updateContestObject.competitionId)}"')
              WHERE "metadata"::jsonb->>'competitionId' = '${sql.raw(originalCompetitionId)}'`,
        );
      }

      await tx.update(table).set(updateContestObject).where(eq(table.id, contest.id));
    });
  });

export const removeContestSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["delete"], meetups: ["delete"] } } })
  .inputSchema(z.strictObject({ competitionId: z.string() }))
  .action(async ({ parsedInput: { competitionId }, ctx: { session } }) => {
    logMessage("RR0011", `Removing contest ${competitionId}`);

    const organizationId = session.organization!.id;
    const contest = await db.query.contests.findFirst({
      with: { creator: { columns: { email: true } } },
      columns: {
        id: true,
        competitionId: true,
        name: true,
        state: true,
        type: true,
        participants: true,
        schedule: true,
        createdBy: true,
      },
      where: { organizationId, competitionId },
    });

    if (!contest) throw new RrActionError(`Contest with ID ${competitionId} not found`);
    if (contest.participants > 0) throw new RrActionError("You may not remove a contest that has results");

    await db.transaction(async (tx) => {
      const newCompetitionId = `${competitionId}_REMOVED`;

      await tx.update(table).set({ state: "removed", competitionId: newCompetitionId }).where(eq(table.id, contest.id));

      await tx
        .update(roundsTable)
        .set({ open: false })
        // We search by the new ID here, because the competition ID update cascades through to the rounds
        .where(and(eq(roundsTable.organizationId, organizationId), eq(roundsTable.competitionId, newCompetitionId)));
    });

    if (contest.creator)
      sendEmail(contest.creator.email, "Contest removed", `Your contest ${contest.name} has been removed.`);
  });

export const openRoundSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["create"], meetups: ["create"] } } })
  .inputSchema(
    z.strictObject({
      competitionId: z.string().nonempty(),
      eventId: z.string().nonempty(),
    }),
  )
  .action<RoundResponse>(async ({ parsedInput: { competitionId, eventId }, ctx: { session } }) => {
    logMessage("RR0012", `Opening next round for event ${eventId} (contest ${competitionId})`);

    const organizationId = session.organization!.id;
    const [contest, rounds, results] = await Promise.all([
      db.query.contests.findFirst({
        columns: { state: true, organizerIds: true },
        where: { organizationId, competitionId },
      }),
      db.query.rounds.findMany({ where: { organizationId, competitionId, eventId }, orderBy: { roundNumber: "asc" } }),
      db.query.results.findMany({ where: { organizationId, competitionId, eventId } }),
    ]);
    const prevOpenRound = rounds.find((r) => r.open === true);

    if (!contest) throw new RrActionError(`Contest with ID ${competitionId} not found`);
    if (!getMemberControlsContest(session.member!, contest))
      throw new RrActionError("You do not have access rights for this contest");
    if (!prevOpenRound) throw new RrActionError("Previous open round not found");
    if (prevOpenRound.roundTypeId === "f") throw new RrActionError("The final round for this event is already open");
    if (getMaxAllowedRounds(rounds, results) < prevOpenRound.roundNumber)
      throw new RrActionError("Previous rounds do not have enough competitors (see WCA regulation 9m)");

    const [openedRound] = await db.transaction(async (tx) => {
      await tx.update(roundsTable).set({ open: false }).where(eq(roundsTable.id, prevOpenRound.id));

      const roundToOpenId = rounds.find((r) => r.roundNumber === prevOpenRound.roundNumber + 1)!.id;
      return await tx
        .update(roundsTable)
        .set({ open: true })
        .where(eq(roundsTable.id, roundToOpenId))
        .returning(roundsPublicCols);
    });

    return openedRound;
  });

export const updateAdminNotesSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { competitions: ["approve"], meetups: ["approve"] } } })
  .inputSchema(
    z.strictObject({
      competitionId: z.string().nonempty(),
      adminNotes: z.string().nonempty().nullable(),
    }),
  )
  .action(async ({ parsedInput: { competitionId, adminNotes }, ctx: { session } }) => {
    const [contest] = await db
      .update(table)
      .set({ adminNotes })
      .where(and(eq(table.organizationId, session.organization!.id), eq(table.competitionId, competitionId)))
      .returning();

    if (!contest) throw new RrActionError(`Competition with ID ${competitionId} not found`);
  });

async function validateAndCleanUpContest(
  organizationId: string,
  contest: ContestDto,
  rounds: RoundDto[],
  userPersonId: number,
  canApprove: boolean,
): Promise<{ region: SelectRegion }> {
  const contestTypes = await getSettingFromDb({ key: "contest-types", organizationId });
  if (!contestTypes.split(",").some((ct) => contest.type === ct))
    throw new RrActionError(`${contest.type} contest type is disabled`);

  const [organizers, events, region] = await Promise.all([
    db
      .select({ id: personsTable.id })
      .from(personsTable)
      .where(and(eq(personsTable.organizationId, organizationId), inArray(personsTable.id, contest.organizerIds))),
    getEvents({ organizationId, includeHiddenAndRemoved: true }),
    db.query.regions.findFirst({ where: { organizationId, code: contest.regionCode } }),
  ]);

  // Make sure all organizer IDs are valid
  if (organizers.length !== contest.organizerIds.length)
    throw new RrActionError("One of the organizer persons was not found");

  if (!region) throw new RrActionError(`Invalid region code: ${contest.regionCode}`);

  // There's also a check for only admins being allowed to select removed events below
  if (!canApprove) {
    if (!contest.organizerIds.some((id) => id === userPersonId))
      throw new RrActionError("You cannot create or edit a contest where you are not an organizer");
  }

  const activityCodes = new Set<string>(); // also used below in schedule validation

  for (const round of rounds) {
    const activityCode = `${round.eventId}-r${round.roundNumber}`;
    if (activityCodes.has(activityCode))
      throw new RrActionError(`Duplicate round schedule activity found: ${activityCode}`);
    activityCodes.add(activityCode);

    if (round.competitionId !== contest.competitionId)
      throw new RrActionError("A round may not have a competition ID different from the contest's competition ID");

    const event = events.find((e) => e.eventId === round.eventId);
    if (!event) throw new RrActionError(`Event with ID ${round.eventId} not found`);
    if (!canApprove && event.category.hidden)
      throw new RrActionError(`${event.name} is an event in a hidden event category, so it cannot be held`);
    const isSomeTimeFormat = ["time", "time-3d"].includes(event.format);
    if (isSomeTimeFormat && !round.timeLimitCentiseconds)
      throw new RrActionError(`${event.name} round ${round.roundNumber} doesn't have a time limit`);

    if (
      !isSomeTimeFormat &&
      (round.timeLimitCentiseconds ||
        round.timeLimitCumulativeRoundIds ||
        round.cutoffAttemptResult ||
        round.cutoffNumberOfAttempts)
    ) {
      throw new RrActionError("A round of an event with a non-time format cannot have a time limit or cutoff");
    }

    if (round.timeLimitCumulativeRoundIds) {
      const cumulativeLimitRounds = await db.query.rounds.findMany({
        where: { organizationId, id: { in: round.timeLimitCumulativeRoundIds }, competitionId: contest.competitionId },
      });

      if (cumulativeLimitRounds.length !== round.timeLimitCumulativeRoundIds.length)
        throw new RrActionError(`One of the cumulative time limit rounds for round ${activityCode} was not found`);
    }
  }

  // Check round numbers and round types
  for (const event of events) {
    const eventRounds = rounds.filter((r) => r.eventId === event.eventId);
    if (eventRounds.length > 0) {
      eventRounds.sort((a, b) => a.roundNumber - b.roundNumber);

      for (let i = 0; i < eventRounds.length; i++) {
        const { roundNumber, roundTypeId } = eventRounds[i];
        if (roundNumber !== i + 1)
          throw new RrActionError(`${event.name} has a missing round number. Please contact the development team.`);

        const message = `${event.name} has a mismatch between the round numbers and round types. Please contact the development team.`;
        if (roundTypeId === "f") {
          if (roundNumber !== eventRounds.length) throw new RrActionError(message);
        } else if (roundTypeId === "s") {
          if (roundNumber !== eventRounds.length - 1) throw new RrActionError(message);
        } else if (roundTypeId !== roundNumber.toString()) {
          throw new RrActionError(message);
        }
      }
    }
  }

  const totalEvents = new Set(rounds.map((r) => r.eventId)).size;

  // Validation of meetups
  if (contest.type === "meetup") {
    if (totalEvents > C.maxTotalMeetupEvents)
      throw new RrActionError(`You may not hold more than ${C.maxTotalMeetupEvents} events at a meetup`);

    const correctTz = findTimezone(contest.latitudeMicrodegrees / 1000000, contest.longitudeMicrodegrees / 1000000)[0];
    if (contest.timezone !== correctTz)
      throw new RrActionError("Contest time zone doesn't match time zone at the given coordinates");
  }
  // Validation of WCA competitions and unofficial competitions
  else {
    if (totalEvents > C.maxTotalEvents)
      throw new RrActionError(`You may not hold more than ${C.maxTotalEvents} events at a competition`);

    for (const round of rounds) {
      const event = events.find((e) => e.eventId === round.eventId)!;
      if (IS_CUBING_CONTESTS_INSTANCE && contest.type === "wca-comp" && event.category.categoryId === "wca") {
        throw new RrActionError(
          "WCA events may not be added for the WCA Competition contest type. They must be held through the WCA website only.",
        );
      }

      let isRoundActivityFound = false;
      for (const venue of contest.schedule!.venues) {
        isRoundActivityFound = venue.rooms.some((r) =>
          r.activities.some((a) => a.activityCode === `${round.eventId}-r${round.roundNumber}`),
        );
        if (isRoundActivityFound) break;
      }
      if (!isRoundActivityFound) throw new RrActionError("Please add all rounds to the schedule");
    }

    // Schedule validation
    for (const venue of contest.schedule!.venues) {
      if (venue.countryIso2 !== contest.regionCode)
        throw new RrActionError("A venue may not have a country different from the contest country");
      if (
        venue.latitudeMicrodegrees !== contest.latitudeMicrodegrees ||
        venue.longitudeMicrodegrees !== contest.longitudeMicrodegrees
      )
        throw new RrActionError("The schedule may not have coordinates different from the contest coordinates");

      const correctTz = findTimezone(venue.latitudeMicrodegrees / 1000000, venue.longitudeMicrodegrees / 1000000)[0];
      if (venue.timezone !== correctTz)
        throw new RrActionError("Venue time zone doesn't match time zone at the given coordinates");

      for (const room of venue.rooms) {
        for (const activity of room.activities) {
          if (!/^other-/.test(activity.activityCode) && !activityCodes.has(activity.activityCode))
            throw new RrActionError(`Activity ${activity.activityCode} does not have a corresponding round`);

          const zonedStartTime = toZonedTime(activity.startTime, venue.timezone).getTime();
          if (zonedStartTime < contest.startDate.getTime())
            throw new RrActionError("An activity may not start before the start date");
          const zonedEndTime = toZonedTime(activity.endTime, venue.timezone).getTime();
          if (zonedEndTime > endOfDay(contest.endDate).getTime())
            throw new RrActionError("An activity may not end after the end date");
          if (zonedStartTime >= zonedEndTime)
            throw new RrActionError("An activity start time may not be after or at the same time as the end time");
        }
      }
    }
  }

  return { region };
}

async function createRounds({
  tx: db,
  rounds,
  organizationId,
}: {
  tx: DbTransactionType; // the tx object from a Drizzle transaction
  rounds: RoundDto[];
  organizationId: string;
}) {
  // The IDs have to be removed, because the rounds could be based on the copy of an existing contest
  const newRounds = rounds.map((r) => ({ ...r, organizationId, id: undefined, open: r.roundNumber === 1 }));

  await db.insert(roundsTable).values(newRounds);
}

async function updateRounds(
  prevRounds: SelectRound[],
  newRounds: RoundDto[],
  results: SelectResult[],
  {
    tx: db,
    canAddNewEvents,
    organizationId,
  }: {
    tx: DbTransactionType; // the tx object from a Drizzle transaction
    canAddNewEvents: boolean;
    organizationId: string;
  },
) {
  // Remove deleted rounds
  const roundsToDelete: number[] = [];
  for (const prevRound of prevRounds) {
    const sameRoundInNew = newRounds.find((r) => r.id === prevRound.id);
    if (!sameRoundInNew) {
      const roundHasResult = results.some((r) => r.roundId === prevRound.id);
      if (roundHasResult) {
        throw new RrActionError(
          `Round ${prevRound.eventId}-r${prevRound.roundNumber} cannot be deleted, because it has results`,
        );
      } else {
        roundsToDelete.push(prevRound.id);
      }
    }
  }
  if (roundsToDelete.length > 0) await db.delete(roundsTable).where(inArray(roundsTable.id, roundsToDelete));

  // Add new rounds and update existing rounds
  const roundsToCreate: RoundDto[] = [];
  for (const newRound of newRounds) {
    const sameRoundInPrev = prevRounds.find((r) => r.id === newRound.id);

    // Add new round
    if (!sameRoundInPrev) {
      const isNewEvent = !prevRounds.some((r) => r.eventId === newRound.eventId);

      if (!isNewEvent) {
        // Set the result proceeds values for the previous final round, if it had any results
        const precedingRound = prevRounds.find((r) => r.eventId === newRound.eventId && r.roundTypeId === "f")!;
        const precedingRoundResults = results.filter((r) => r.roundId === precedingRound.id);

        if (precedingRoundResults.length > 0) {
          // First, set all proceeds values to false, then set the results that proceeded
          await db.update(resultsTable).set({ proceeds: false }).where(eq(resultsTable.roundId, precedingRound.id));

          const roundFormat = roundFormats.find((rf) => rf.value === precedingRound.format)!;
          const resultsToProceed: number[] = [];
          for (const result of precedingRoundResults)
            if (getResultProceeds(result, precedingRound, roundFormat, results)) resultsToProceed.push(result.id);

          await db.update(resultsTable).set({ proceeds: true }).where(inArray(resultsTable.id, resultsToProceed));
        }
      } else if (!canAddNewEvents) {
        throw new RrActionError("Moderators are not allowed to add new events. Please contact the admin team.");
      }

      roundsToCreate.push(newRound);
    }
    // Update existing round
    else {
      const updateRoundObject: Partial<SelectRound> = {
        roundTypeId: newRound.roundTypeId,
        proceedValue: newRound.proceedValue,
        proceedType: newRound.proceedType,
      };
      const roundHasResult = results.some((r) => r.roundId === newRound.id);

      if (!roundHasResult) {
        updateRoundObject.format = newRound.format;
        updateRoundObject.timeLimitCentiseconds = newRound.timeLimitCentiseconds;
        updateRoundObject.timeLimitCumulativeRoundIds = newRound.timeLimitCumulativeRoundIds;
        updateRoundObject.cutoffAttemptResult = newRound.cutoffAttemptResult;
        updateRoundObject.cutoffNumberOfAttempts = newRound.cutoffNumberOfAttempts;
      }

      if (newRound.open) {
        updateRoundObject.open = true;

        // If the round became the final round after a deletion, remove the result proceeds values in that round
        if (newRound.roundTypeId === "f" && sameRoundInPrev.roundTypeId !== "f")
          await db.update(resultsTable).set({ proceeds: null }).where(eq(resultsTable.roundId, sameRoundInPrev.id));
      }

      await db.update(roundsTable).set(updateRoundObject).where(eq(roundsTable.id, sameRoundInPrev.id));
    }
  }
  if (roundsToCreate.length > 0) await createRounds({ tx: db, rounds: roundsToCreate, organizationId });
}

async function getUpdatedSchedule(prevSchedule: Schedule, newSchedule: Schedule): Promise<Schedule> {
  // TO-DO: ADD PROPER SUPPORT FOR MULTIPLE VENUES, WITH ADDITION AND DELETION OF VENUES!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  for (const venue of newSchedule.venues) {
    const sameVenueInPrev = prevSchedule.venues.find((v) => v.id === venue.id);
    if (!sameVenueInPrev) throw new RrActionError(`Schedule venue with ID ${venue.id} not found`);

    sameVenueInPrev.name = venue.name;
    sameVenueInPrev.latitudeMicrodegrees = venue.latitudeMicrodegrees;
    sameVenueInPrev.longitudeMicrodegrees = venue.longitudeMicrodegrees;
    sameVenueInPrev.timezone = venue.timezone;
    // Remove deleted rooms
    sameVenueInPrev.rooms = sameVenueInPrev.rooms.filter((r1) => venue.rooms.some((r2) => r2.id === r1.id));

    for (const room of venue.rooms) {
      const sameRoomInPrev = sameVenueInPrev.rooms.find((r) => r.id === room.id);

      if (sameRoomInPrev) {
        sameRoomInPrev.name = room.name;
        sameRoomInPrev.color = room.color;
        // Remove deleted activities
        sameRoomInPrev.activities = sameRoomInPrev.activities.filter((a1) =>
          room.activities.some((a2) => a2.id === a1.id),
        );

        // TO-DO: ADD SUPPORT FOR CHILD ACTIVITIES!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // Update activities
        for (const activity of room.activities) {
          const sameActivityInPrev = sameRoomInPrev.activities.find((a) => a.id === activity.id);

          if (sameActivityInPrev) {
            sameActivityInPrev.activityCode = activity.activityCode;
            sameActivityInPrev.name = sameActivityInPrev.activityCode === "other-misc" ? activity.name : undefined;
            sameActivityInPrev.startTime = activity.startTime;
            sameActivityInPrev.endTime = activity.endTime;
          } else {
            // If it's a new activity, add it
            sameRoomInPrev.activities.push(activity);
          }
        }
      } else {
        // If it's a new room, add it
        sameVenueInPrev.rooms.push(room);
      }
    }
  }

  return prevSchedule;
}
