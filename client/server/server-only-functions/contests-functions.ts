import "server-only";
import { and, arrayContains, desc, eq, exists, inArray } from "drizzle-orm";
import { type DbTransactionType, db } from "~/server/db/provider.ts";
import { type SelectContest, contestsTable as table } from "~/server/db/schema/contests.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import { type PersonResponse, personsPublicCols, personsTable } from "~/server/db/schema/persons.ts";
import type { RecordConfigResponse } from "~/server/db/schema/record-configs.ts";
import { type RegionResponse, regionsTable } from "~/server/db/schema/regions.ts";
import { type ResultResponse, resultsPublicCols, resultsTable } from "~/server/db/schema/results.ts";
import { type RoundResponse, roundsPublicCols, roundsTable } from "~/server/db/schema/rounds.ts";
import { getEvents, getRecordConfigs, getRegions } from "~/server/server-only-functions/server-only-functions.ts";

export async function getContests({
  organizationId,
  eventId,
  region,
  competitorPersonId,
}: {
  organizationId: string;
  eventId?: string;
  region?: RegionResponse;
  competitorPersonId?: number;
}) {
  return await db
    .select({
      competitionId: table.competitionId,
      shortName: table.shortName,
      type: table.type,
      city: table.city,
      regionCode: table.regionCode,
      startDate: table.startDate,
      endDate: table.endDate,
      participants: table.participants,
    })
    .from(table)
    .leftJoin(
      regionsTable,
      and(eq(table.organizationId, regionsTable.organizationId), eq(table.regionCode, regionsTable.code)),
    )
    .where(
      and(
        eq(table.organizationId, organizationId),
        inArray(table.state, ["approved", "ongoing", "finished", "published"]),
        // Filter by continent or by country
        region
          ? eq(region.type === "super-region" ? regionsTable.superRegionCode : table.regionCode, region.code)
          : undefined,
        eventId
          ? exists(
              db
                .select()
                .from(roundsTable)
                .where(
                  and(
                    eq(roundsTable.organizationId, table.organizationId),
                    eq(roundsTable.competitionId, table.competitionId),
                    eq(roundsTable.eventId, eventId),
                  ),
                ),
            )
          : undefined,
        competitorPersonId
          ? exists(
              db
                .select()
                .from(resultsTable)
                .where(
                  and(
                    eq(resultsTable.organizationId, table.organizationId),
                    eq(resultsTable.competitionId, table.competitionId),
                    arrayContains(resultsTable.personIds, [competitorPersonId]),
                  ),
                ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(table.startDate));
}

export async function getContest({
  organizationId,
  competitionId,
  eventId,
}: {
  organizationId: string;
  competitionId: string;
  eventId?: string;
}): Promise<{
  contest: Pick<
    SelectContest,
    "competitionId" | "state" | "name" | "shortName" | "type" | "startDate" | "organizerIds" | "schedule"
  >;
  events: EventResponseWithCategory[];
  rounds: RoundResponse[];
  results: ResultResponse[];
  persons: PersonResponse[];
  recordConfigs: RecordConfigResponse[];
  regions: RegionResponse[];
} | null> {
  const [contest, rounds] = await Promise.all([
    db.query.contests.findFirst({
      columns: {
        competitionId: true,
        state: true,
        name: true,
        shortName: true,
        type: true,
        startDate: true,
        organizerIds: true,
        schedule: true,
      },
      where: { organizationId, competitionId },
    }),
    // Rounds are further filtered below, once it's known what event is needed
    db
      .select(roundsPublicCols)
      .from(roundsTable)
      .where(and(eq(roundsTable.organizationId, organizationId), eq(roundsTable.competitionId, competitionId)))
      .orderBy(roundsTable.roundNumber),
  ]);
  if (!contest) return null;

  const eventIds = Array.from(new Set(rounds.map((r) => r.eventId)));

  const [events, recordConfigs, regions] = await Promise.all([
    getEvents({ organizationId, eventIds }),
    getRecordConfigs(organizationId, { contestType: contest.type }),
    getRegions(organizationId),
  ]);
  if (eventId && !events.some((e) => e.eventId === eventId)) throw new Error(`Event with ID ${eventId} not found`);

  const eventIdOrFirst = eventId ?? events[0].eventId;

  const results = await getContestEventResults({ organizationId, competitionId, eventId: eventIdOrFirst });

  const personIds = Array.from(
    new Set(results.map((r) => r.personIds).reduce((prev, curr) => [...(prev as []), ...curr], [])),
  );
  const persons = await db.select(personsPublicCols).from(personsTable).where(inArray(personsTable.id, personIds));

  return {
    contest,
    events,
    rounds: rounds.filter((r) => r.eventId === eventIdOrFirst),
    results,
    persons,
    recordConfigs,
    regions,
  };
}

export async function getContestEventResults({
  organizationId,
  competitionId,
  eventId,
}: {
  organizationId: string;
  competitionId: string;
  eventId: string;
}) {
  return await db
    .select(resultsPublicCols)
    .from(resultsTable)
    .where(
      and(
        eq(resultsTable.organizationId, organizationId),
        eq(resultsTable.competitionId, competitionId),
        eq(resultsTable.eventId, eventId),
      ),
    )
    .orderBy(resultsTable.roundId, resultsTable.ranking);
}

export async function getContestParticipantIds({
  tx: db,
  organizationId,
  competitionId,
}: {
  tx: DbTransactionType;
  organizationId: string;
  competitionId: string;
}): Promise<number[]> {
  const results = await db.query.results.findMany({
    columns: { personIds: true },
    where: { organizationId, competitionId },
  });

  const participantIds = new Set<number>();
  for (const result of results) {
    for (const personId of result.personIds) {
      participantIds.add(personId);
    }
  }

  return Array.from(participantIds);
}
