"use server";

import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { C } from "~/helpers/constants.ts";
import type { GetOrCreatePersonObject, PaginatedData } from "~/helpers/types.ts";
import { fetchWcaPerson, getNameAndLocalizedName, getSimplifiedString } from "~/helpers/utility-functions.ts";
import { type PersonDto, PersonValidator } from "~/helpers/validators/Person.ts";
import { RegionCodeValidator, WcaIdValidator } from "~/helpers/validators/Validators.ts";
import { auth } from "~/server/auth.ts";
import { type DbTransactionType, db } from "~/server/db/provider.ts";
import { usersTable } from "~/server/db/schema/auth-schema.ts";
import { contestsTable } from "~/server/db/schema/contests.ts";
import {
  type PersonResponse,
  personsPublicCols,
  type SelectPerson,
  personsTable as table,
} from "~/server/db/schema/persons.ts";
import { resultsTable } from "~/server/db/schema/results.ts";
import { actionClient, RrActionError } from "~/server/safe-action.ts";
import {
  getOrCreatePersonByWcaId,
  getOrgDetails,
  getPersonExactMatchWcaId,
  logMessage,
  validateMaxTotalPersons,
} from "~/server/server-only-functions/server-only-functions.ts";

export const getPersonByIdSF = actionClient
  .metadata({ auth: { useOrganization: true } })
  .inputSchema(
    z.strictObject({
      id: z.int().min(1),
      forCompetitionId: z.string().nonempty().optional(),
    }),
  )
  .action<PersonResponse | PersonResponse[]>(async ({ parsedInput: { id, forCompetitionId }, ctx: { session } }) => {
    const [person] = await db
      .select(personsPublicCols)
      .from(table)
      .where(and(eq(table.organizationId, session.organization!.id), eq(table.id, id)));

    if (!person) throw new RrActionError(`Person with ID ${id} not found`);

    if (forCompetitionId) {
      const [contest] = await db
        .select({ type: contestsTable.type })
        .from(contestsTable)
        .where(
          and(
            eq(contestsTable.organizationId, session.organization!.id),
            eq(contestsTable.competitionId, forCompetitionId),
          ),
        );
      if (!contest) throw new RrActionError("Competition not found");

      if (contest.type === "wca-comp") {
        const wcifRes = await fetch(`${C.wcaApiBaseUrl}/competitions/${forCompetitionId}/wcif/public`);
        if (!wcifRes.ok) throw new RrActionError("WCA competition not found");

        const wcif = z
          .object({ persons: z.object({ registrantId: z.int().nullable(), wcaId: z.string().nullable() }).array() })
          .parse(await wcifRes.json());
        const wcifPerson = wcif.persons.find((p) => p.registrantId === id);
        if (wcifPerson?.wcaId) {
          const { person: wcaRegistrantPerson } = await getOrCreatePersonByWcaId(wcifPerson.wcaId, {
            creatorUserId: session.user.id,
            organization: session.organization!,
          });
          return [wcaRegistrantPerson, person];
        }
      }

      return [person];
    }

    return person;
  });

export const getPersonsByNameSF = actionClient
  .metadata({ auth: { useOrganization: true } })
  .inputSchema(
    z.strictObject({
      name: z.string().max(60),
    }),
  )
  .action<PersonResponse[]>(async ({ parsedInput: { name }, ctx: { session } }) => {
    const simplifiedParts = getSimplifiedString(name)
      .split(" ")
      .filter((part) => part !== "")
      .map((part) => `%${part}%`);
    const nameQuery = and(...simplifiedParts.map((part) => ilike(sql`UNACCENT(${table.name})`, part)));
    const locNameQuery = and(...simplifiedParts.map((part) => ilike(table.localizedName, part)));

    return await db
      .select(personsPublicCols)
      .from(table)
      .where(and(eq(table.organizationId, session.organization!.id), or(nameQuery, locNameQuery)))
      .limit(C.maxSearchMatches);
  });

export const getPersonProfilesSF = actionClient
  .metadata({ auth: null })
  .inputSchema(
    z.strictObject({
      slug: z.string().nonempty(),
      search: z.string().max(100).default(""),
      approved: z.enum(["approved", "unapproved"]).optional(),
      regionCode: RegionCodeValidator.optional(),
      competitionId: z.string().optional(),
      orderBy: z.enum(["id", "name"]).default("id"),
      page: z.number().int().min(1).default(1),
    }),
  )
  .action<PaginatedData<SelectPerson>>(
    async ({
      parsedInput: { slug, search, approved, regionCode, competitionId, orderBy, page },
      ctx: { session, httpHeaders },
    }) => {
      const organization = await getOrgDetails({ slug, session });
      const { success: canManagePersons } = await auth.api
        .hasPermission({
          body: { permissions: { persons: ["create", "update"] } },
          headers: httpHeaders,
        })
        .catch(() => ({ success: false }));
      if (!canManagePersons && approved !== undefined)
        throw new RrActionError("You are unauthorized to perform this action");

      const queryFilters: any[] = [eq(table.organizationId, organization.id)];

      if (approved === "approved") queryFilters.push(eq(table.approved, true));
      else if (approved === "unapproved") queryFilters.push(eq(table.approved, false));

      if (regionCode) queryFilters.push(eq(table.regionCode, regionCode));

      if (competitionId) {
        const participantQuery = inArray(
          table.id,
          db
            .select({ id: sql`UNNEST(${resultsTable.personIds})` })
            .from(resultsTable)
            .where(
              and(eq(resultsTable.organizationId, organization.id), eq(resultsTable.competitionId, competitionId)),
            ),
        );

        const organizerQuery = inArray(
          table.id,
          db
            .select({ id: sql`UNNEST(${contestsTable.organizerIds})` })
            .from(contestsTable)
            .where(
              and(eq(contestsTable.organizationId, organization.id), eq(contestsTable.competitionId, competitionId)),
            ),
        );

        queryFilters.push(or(participantQuery, organizerQuery));
      }

      const simplifiedSearch = getSimplifiedString(search);
      if (simplifiedSearch) {
        const searchId = Number(simplifiedSearch);

        if (Number.isNaN(searchId)) {
          const simplifiedParts = simplifiedSearch
            .split(" ")
            .filter((part) => part !== "")
            .map((part) => `%${part}%`);
          const nameQuery = and(...simplifiedParts.map((part) => ilike(sql`UNACCENT(${table.name})`, part)));
          const locNameQuery = and(...simplifiedParts.map((part) => ilike(table.localizedName, part)));
          const wcaIdQuery = eq(sql`LOWER(${table.wcaId})`, simplifiedSearch);

          // Search by the name of the creator of the person
          const creatorQuery = canManagePersons
            ? inArray(
                table.createdBy,
                db
                  .select({ id: usersTable.id })
                  .from(usersTable)
                  .where(
                    or(
                      and(...simplifiedParts.map((part) => ilike(sql`UNACCENT(${usersTable.name})`, part))),
                      and(...simplifiedParts.map((part) => ilike(sql`UNACCENT(${usersTable.username})`, part))),
                    ),
                  ),
              )
            : undefined;

          queryFilters.push(or(nameQuery, locNameQuery, wcaIdQuery, creatorQuery));
        } else {
          queryFilters.push(eq(table.id, searchId));
        }
      }

      const [persons, [{ total: totalEntries }]] = await Promise.all([
        db
          .select()
          .from(table)
          .where(and(...queryFilters))
          .orderBy(orderBy === "name" ? asc(table.name) : desc(table.id))
          .limit(C.defaultPageSize)
          .offset((page - 1) * C.defaultPageSize),
        db
          .select({ total: count() })
          .from(table)
          .where(and(...queryFilters)),
      ]);

      return { entries: persons, totalEntries: totalEntries ?? 0 };
    },
  );

export const getOrCreatePersonSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { persons: ["create"] } } })
  .inputSchema(
    z.strictObject({
      name: z.string().nonempty(),
      regionCode: z.string().nonempty(),
    }),
  )
  .action<GetOrCreatePersonObject>(async ({ parsedInput: { name: n, regionCode }, ctx: { session } }) => {
    const { name, localizedName } = getNameAndLocalizedName(n);
    const persons = await db
      .select(personsPublicCols)
      .from(table)
      .where(
        and(
          eq(table.organizationId, session.organization!.id),
          eq(table.name, name),
          localizedName ? eq(table.localizedName, localizedName) : undefined,
          eq(table.regionCode, regionCode),
        ),
      );

    if (persons.length > 1)
      throw new RrActionError(`Multiple people were found with the name ${n} and country ${regionCode}`);

    if (persons.length === 1) return { person: persons[0], isNew: false };

    const res = await createPersonSF({
      newPersonDto: { name, localizedName: localizedName ?? null, regionCode, wcaId: null },
    });
    if (!res.data) throw new Error(res.serverError?.message || C.message.unknownError);

    return { person: res.data, isNew: true };
  });

export const getOrCreatePersonByWcaIdSF = actionClient
  .metadata({ auth: { useOrganization: true } })
  .inputSchema(
    z.strictObject({
      wcaId: WcaIdValidator,
    }),
  )
  .action<GetOrCreatePersonObject>(async ({ parsedInput: { wcaId }, ctx: { session } }) => {
    return await getOrCreatePersonByWcaId(wcaId, {
      creatorUserId: session.user.id,
      organization: session.organization!,
    });
  });

export const createPersonSF = actionClient
  // Permissions checked below
  .metadata({ auth: { useOrganization: true } })
  .inputSchema(
    z.strictObject({
      newPersonDto: PersonValidator,
      ignoreDuplicate: z.boolean().default(false),
    }),
  )
  .action<SelectPerson>(async ({ parsedInput: { newPersonDto, ignoreDuplicate }, ctx: { session, httpHeaders } }) => {
    newPersonDto.name = newPersonDto.name.trim();
    if (newPersonDto.localizedName) newPersonDto.localizedName = newPersonDto.localizedName.trim();
    const { name, wcaId } = newPersonDto;
    logMessage("RR0019", `Creating person with name ${name} and ${wcaId ? `WCA ID ${wcaId}` : "no WCA ID"}`);

    await validateMaxTotalPersons(session.organization!);

    const [{ success: canCreate }, { success: canApprove }] = await Promise.all([
      auth.api.hasPermission({ headers: httpHeaders, body: { permissions: { persons: ["create"] } } }),
      auth.api.hasPermission({ headers: httpHeaders, body: { permissions: { persons: ["approve"] } } }),
    ]);

    // Regular users are only allowed to create one person without a WCA ID (when requesting a competitor profile)
    if (!canCreate) {
      if (session.member!.personId) {
        throw new RrActionError("You already have a competitor profile tied to your account");
      } else {
        const existingProfile = await db.query.persons.findFirst({
          columns: { id: true },
          where: { organizationId: session.organization!.id, createdBy: session.user.id, wcaId: { isNull: true } },
        });
        if (existingProfile) {
          throw new RrActionError(
            `You have already created a competitor profile (ID ${existingProfile.id}). Edit that profile instead of creating a new one.`,
          );
        }
      }
    }

    await validatePerson(session.organization!.id, newPersonDto, { ignoreDuplicate, canApprove });

    const [createdPerson] = await db
      .insert(table)
      .values({ ...newPersonDto, organizationId: session.organization!.id, createdBy: session.user.id })
      .returning();
    return createdPerson;
  });

export const bulkCreatePersonsSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { persons: ["bulk-create"] } } })
  .inputSchema(
    z.strictObject({
      newPersons: z.array(PersonValidator),
    }),
  )
  .action(async ({ parsedInput: { newPersons }, ctx: { session } }) => {
    logMessage("RR0061", "Bulk adding persons with IDs");

    await validateMaxTotalPersons(session.organization!, newPersons.length);

    await db.transaction(async (tx) => {
      for (const person of newPersons) {
        await validatePerson(session.organization!.id, person, { tx });
        await createPersonSF({ newPersonDto: person });
      }
    });
  });

export const updatePersonSF = actionClient
  // Permissions checked below
  .metadata({ auth: { useOrganization: true } })
  .inputSchema(
    z.strictObject({
      id: z.int(),
      newPersonDto: PersonValidator,
      ignoreDuplicate: z.boolean().default(false), // this is only relevant when the user has the approve permission (see validatePerson())
    }),
  )
  .action<SelectPerson>(
    async ({ parsedInput: { id, newPersonDto, ignoreDuplicate }, ctx: { session, httpHeaders } }) => {
      const { name, wcaId } = newPersonDto;
      logMessage("RR0020", `Updating person with name ${name} and ${wcaId ? `WCA ID ${wcaId}` : "no WCA ID"}`);

      const [{ success: canUpdate }, { success: canApprove }] = await Promise.all([
        auth.api.hasPermission({ headers: httpHeaders, body: { permissions: { persons: ["update"] } } }),
        auth.api.hasPermission({ headers: httpHeaders, body: { permissions: { persons: ["approve"] } } }),
      ]);

      const person = await db.query.persons.findFirst({ where: { organizationId: session.organization!.id, id } });
      if (!person) throw new RrActionError("Person with the provided ID not found");
      const canUpdateOwnWcaPerson = id === session.member!.personId && person.wcaId && newPersonDto.wcaId;
      const canUpdateOwnCreatedPerson = canUpdate && person.createdBy === session.user.id && !person.approved;
      // This logic is consistent with getMemberRequestDetails() and deletePersonSF()
      const canUpdateOwnRequestedPerson =
        person.createdBy === session.user.id && !person.approved && !person.wcaId && !newPersonDto.wcaId;
      if (!canApprove && !canUpdateOwnWcaPerson && !canUpdateOwnCreatedPerson && !canUpdateOwnRequestedPerson)
        throw new RrActionError("You are unauthorized to update this person");
      if (person.wcaId && newPersonDto.wcaId && person.wcaId !== newPersonDto.wcaId)
        throw new RrActionError("Changing a person's WCA ID is not allowed");

      let personDto: PersonDto = newPersonDto;

      if (newPersonDto.wcaId) {
        const wcaPerson = await fetchWcaPerson(newPersonDto.wcaId);
        if (!wcaPerson) throw new RrActionError(`Person with WCA ID ${newPersonDto.wcaId} not found`);
        personDto = wcaPerson;
      }

      // TO-DO: WE MAY HAVE TO DO SOMETHING ABOUT PAST RECORDS SET BY THE COMPETITOR WHO IS CHANGING THEIR COUNTRY!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      if (person.regionCode !== personDto.regionCode) {
        throw new RrActionError(
          "Changing a person's country is not currently supported. Please contact the admin team.",
        );
      }

      await validatePerson(session.organization!.id, personDto, { excludeId: id, ignoreDuplicate, canApprove });

      const [updatedPerson] = await db.update(table).set(personDto).where(eq(table.id, id)).returning();
      return updatedPerson;
    },
  );

export const deletePersonSF = actionClient
  // Permissions checked below
  .metadata({ auth: { useOrganization: true } })
  .inputSchema(
    z.strictObject({
      id: z.int(),
    }),
  )
  .action(async ({ parsedInput: { id }, ctx: { session, httpHeaders } }) => {
    logMessage("RR0021", `Deleting person with ID ${id}`);

    const [{ success: canDelete }, { success: canApprove }] = await Promise.all([
      auth.api.hasPermission({ headers: httpHeaders, body: { permissions: { persons: ["delete"] } } }),
      auth.api.hasPermission({ headers: httpHeaders, body: { permissions: { persons: ["approve"] } } }),
    ]);

    const person = await db.query.persons.findFirst({ where: { organizationId: session.organization!.id, id } });
    if (!person) throw new RrActionError("Person with the provided ID not found");
    const canDeleteAnyPerson = canDelete && canApprove;
    const canDeleteOwnCreatedPerson = canDelete && person.createdBy === session.user.id && !person.approved;
    // This logic is consistent with updatePersonSF()
    const canDeleteOwnRequestedPerson = person.createdBy === session.user.id && !person.approved && !person.wcaId;
    if (!canDeleteAnyPerson && !canDeleteOwnCreatedPerson && !canDeleteOwnRequestedPerson)
      throw new RrActionError("You are unauthorized to delete this person");

    const res = await getPersonIsTiedToSomething(id);
    if (res) {
      switch (res.tiedTo) {
        case "result":
          throw new RrActionError(`You may not delete a person that has a result. ${res.details}`);
        case "organizedContest":
          throw new RrActionError(`You may not delete a person that has organized a contest. ${res.details}`);
        case "member":
          throw new RrActionError(`You may not delete a person tied to a member profile. ${res.details}`);
        case "memberRequest":
          throw new RrActionError(
            `You may not delete a person that was requested as a competitor profile. ${res.details}`,
          );
        default:
          throw new Error(`Unknown object type: ${res.tiedTo}`);
      }
    }

    await db.delete(table).where(eq(table.id, id));
  });

export const approvePersonSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { persons: ["approve"] } } })
  .inputSchema(
    z.strictObject({
      id: z.int(),
      ignoredWcaMatches: z.array(z.string()).default([]),
    }),
  )
  .action<SelectPerson>(async ({ parsedInput: { id, ignoredWcaMatches }, ctx: { session } }) => {
    const person = await db.query.persons.findFirst({ where: { organizationId: session.organization!.id, id } });
    if (!person) throw new RrActionError("Person not found");
    if (person.approved) throw new RrActionError(`${person.name} has already been approved`);

    if ((await getPersonIsTiedToSomething(id)) === null) {
      throw new RrActionError(
        `${person.name} has no results, hasn't organized any contests and isn't tied to a member profile. They could have been added by accident, so they can be safely deleted.`,
      );
    }

    if (!person.wcaId) {
      const matchedPersonWcaId = await getPersonExactMatchWcaId(person, ignoredWcaMatches);
      if (matchedPersonWcaId) {
        throw new RrActionError(
          `${person.name} has an exact name and country match with the WCA competitor with WCA ID ${matchedPersonWcaId}. If that is the same person, edit their profile, adding the WCA ID. If it's a different person, simply approve them again to confirm.`,
          { data: { wcaMatches: [...ignoredWcaMatches, matchedPersonWcaId] } },
        );
      }
    }

    logMessage("RR0022", `Approving person ${person.name} (ID: ${person.id})`);

    const [approvedPerson] = await db.update(table).set({ approved: true }).where(eq(table.id, id)).returning();
    return approvedPerson;
  });

export const mergePersonsSF = actionClient
  .metadata({ auth: { useOrganization: true, orgPermissions: { persons: ["approve"] } } })
  .inputSchema(
    z.strictObject({
      personId1: z.int().min(1), // Person A (the one kept after merge)
      personId2: z.int().min(1), // Person B (merged into A, then deleted)
    }),
  )
  .action<SelectPerson>(async ({ parsedInput: { personId1, personId2 }, ctx: { session } }) => {
    logMessage("RR0060", `Merging person with ID ${personId2} and person with ID ${personId1}`);

    if (personId1 === personId2) throw new RrActionError("Both person IDs are the same");

    const [person1, person2] = await Promise.all([
      db.query.persons.findFirst({ where: { organizationId: session.organization!.id, id: personId1 } }),
      db.query.persons.findFirst({ where: { organizationId: session.organization!.id, id: personId2 } }),
    ]);

    if (!person1 || !person2) throw new RrActionError("Person not found");
    if (person1.wcaId && person2.wcaId)
      throw new RrActionError("Both persons have WCA IDs. At most one can have a WCA ID for a merge.");
    if (person1.regionCode !== person2.regionCode)
      throw new RrActionError("Both persons must be from the same country to be merged.");

    for (const person of [person1, person2] as const) {
      const member = await db.query.members.findFirst({ where: { personId: person.id } });
      if (member) {
        throw new RrActionError(
          `${person.name} (ID: ${person.id}) is linked to a member profile and cannot be merged.`,
        );
      }

      const memberRequest = await db.query.memberRequests.findFirst({ where: { requestedPersonId: person.id } });
      if (memberRequest) {
        throw new RrActionError(
          `${person.name} (ID: ${person.id}) is linked to a member request and cannot be merged.`,
        );
      }
    }

    // Determine which person is A (earlier createdAt) and which is B (merged into A)
    const personA = person1.createdAt < person2.createdAt ? person1 : person2;
    const personB = personA === person1 ? person2 : person1;

    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`UPDATE ${resultsTable}
            SET person_ids = (
              SELECT ARRAY_AGG(CASE WHEN elem = ${personB.id} THEN ${personA.id} ELSE elem END)
              FROM UNNEST(${resultsTable.personIds}) AS elem
            )
            WHERE ${resultsTable.organizationId} = ${session.organization!.id}
              AND ${personB.id} = ANY(${resultsTable.personIds})`,
      );

      await tx.execute(
        sql`UPDATE ${contestsTable}
            SET organizer_ids = (
              SELECT ARRAY_AGG(CASE WHEN elem = ${personB.id} THEN ${personA.id} ELSE elem END)
              FROM UNNEST(${contestsTable.organizerIds}) AS elem
            )
            WHERE ${contestsTable.organizationId} = ${session.organization!.id}
              AND ${personB.id} = ANY(${contestsTable.organizerIds})`,
      );

      await tx.delete(table).where(eq(table.id, personB.id));

      const updateObj: Partial<SelectPerson> = {};
      if (!personA.approved && personB.approved) updateObj.approved = true;
      if (!personA.wcaId) {
        if (personB.wcaId) {
          updateObj.wcaId = personB.wcaId;
          updateObj.name = personB.name;
          if (personB.localizedName) updateObj.localizedName = personB.localizedName;
          else if (personA.localizedName) updateObj.localizedName = null;
        } else if (!personA.localizedName && personB.localizedName) {
          updateObj.localizedName = personB.localizedName;
        }
      }
      if (Object.keys(updateObj).length > 0) await tx.update(table).set(updateObj).where(eq(table.id, personA.id));

      const [mergedPerson] = await tx.select().from(table).where(eq(table.id, personA.id));
      return mergedPerson;
    });
  });

async function validatePerson(
  organizationId: string,
  newPersonDto: PersonDto,
  {
    tx,
    ignoreDuplicate,
    excludeId,
    canApprove,
  }: {
    tx?: DbTransactionType;
    ignoreDuplicate?: boolean;
    excludeId?: number;
    canApprove?: boolean;
  },
) {
  const excludeCondition = excludeId ? ne(table.id, excludeId) : undefined;

  if (newPersonDto.wcaId) {
    const [sameWcaIdPerson] = await (tx ?? db)
      .select()
      .from(table)
      .where(and(eq(table.organizationId, organizationId), eq(table.wcaId, newPersonDto.wcaId), excludeCondition))
      .limit(1);

    if (sameWcaIdPerson) throw new RrActionError("A person with the same WCA ID already exists in the CC database");
  } else if (!canApprove || !ignoreDuplicate) {
    const [duplicatePerson] = await (tx ?? db)
      .select()
      .from(table)
      .where(
        and(
          eq(table.organizationId, organizationId),
          eq(table.name, newPersonDto.name),
          eq(table.regionCode, newPersonDto.regionCode),
          excludeCondition,
        ),
      )
      .limit(1);

    if (duplicatePerson) {
      throw new RrActionError(
        `A person with the same name and country already exists. If it's actually a different competitor with the same name, ${
          canApprove
            ? "simply submit them again."
            : "please report this to the admin team. For now, simply add (2) at the end of their name to do data entry."
        }`,
        { data: { isDuplicatePerson: true } },
      );
    }
  }
}

async function getPersonIsTiedToSomething(personId: number): Promise<{
  tiedTo: "result" | "organizedContest" | "member" | "memberRequest";
  details: string;
} | null> {
  const result = await db.query.results.findFirst({ where: { personIds: { arrayContains: [personId] } } });
  if (result) {
    return {
      tiedTo: "result",
      details: `This person has a result in ${result.eventId}${result.competitionId ? ` at ${result.competitionId}` : " (video-based result)"}.`,
    };
  }

  const organizedContest = await db.query.contests.findFirst({
    columns: { competitionId: true },
    where: { organizerIds: { arrayContains: [personId] } },
  });
  if (organizedContest)
    return { tiedTo: "organizedContest", details: `This person is an organizer at ${organizedContest.competitionId}.` };

  const member = await db.query.members.findFirst({
    with: { user: { columns: { name: true } } },
    where: { personId },
  });
  if (member) return { tiedTo: "member", details: `This person is tied to the member ${member.user.name}.` };

  const memberRequest = await db.query.memberRequests.findFirst({
    with: { user: { columns: { name: true } } },
    columns: { id: true },
    where: { requestedPersonId: personId },
  });
  if (memberRequest) {
    return {
      tiedTo: "memberRequest",
      details: `This person was requested by member ${memberRequest.user.name}.`,
    };
  }

  return null;
}
