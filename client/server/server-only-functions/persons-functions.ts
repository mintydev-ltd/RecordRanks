import "server-only";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { RecordCategory } from "~/helpers/types.ts";
import { db } from "~/server/db/provider.ts";
import { type ContestResponse, contestsTable } from "~/server/db/schema/contests.ts";
import { eventCategoriesTable } from "~/server/db/schema/event-categories.ts";
import { eventsTable } from "~/server/db/schema/events.ts";
import { type PersonDetails, type PersonResponse, personsTable } from "~/server/db/schema/persons.ts";
import { type Attempt, resultsTable } from "~/server/db/schema/results.ts";

// This has to return a schema matching the PersonDetails type
export const personsArrayJsonSql = sql`
  JSON_AGG(
    JSON_BUILD_OBJECT(
      'id', ${personsTable.id},
      'name', ${personsTable.name},
      'localizedName', ${personsTable.localizedName},
      'regionCode', ${personsTable.regionCode},
      'wcaId', ${personsTable.wcaId}
    )
  )`;

export type PersonalRecordPair = {
  eventId: string;
  recordCategory: RecordCategory;
  single: number;
  average: number | undefined;
};

export async function getPersonalRecords({
  organizationId,
  personId,
  eventCategoryId,
  recordCategory,
}: {
  organizationId: string;
  personId: number;
  eventCategoryId: number;
  recordCategory: RecordCategory;
}): Promise<PersonalRecordPair[]> {
  const person = await db.query.persons.findFirst({ columns: { id: true }, where: { organizationId, id: personId } });
  if (!person) throw new Error("Person not found");

  const getPrCte = (bestOrAverage: "best" | "average") => {
    const isAverage = bestOrAverage === "average";
    return sql`
      SELECT DISTINCT ON (${eventsTable.eventId})
        ${eventsTable.eventId},
        ${eventsTable.rank} AS event_rank,
        ${resultsTable[bestOrAverage]} AS best_result
      FROM ${resultsTable}
        INNER JOIN ${eventsTable}
          ON ${resultsTable.organizationId} = ${eventsTable.organizationId} AND ${resultsTable.eventId} = ${eventsTable.eventId}
        INNER JOIN ${eventCategoriesTable} ON ${eventsTable.categoryId} = ${eventCategoriesTable.id}
      WHERE ${resultsTable.approved} IS TRUE
        AND ${resultsTable.recordCategory} = ${recordCategory}
        AND ${eventCategoriesTable.id} = ${eventCategoryId}
        AND ${eventCategoriesTable.hidden} IS FALSE
        AND ${eventsTable.hidden} IS FALSE
        AND ${personId} = ANY(${resultsTable.personIds})
        AND ${resultsTable[bestOrAverage]} > 0
        ${
          isAverage
            ? sql`AND CARDINALITY(${resultsTable.attempts}) = CASE WHEN ${eventsTable.defaultRoundFormat} IN ('5', 'a') THEN 5 ELSE 3 END`
            : sql``
        }
      ORDER BY ${eventsTable.eventId},
        CASE WHEN ${eventsTable.higherIsBetter} THEN ${resultsTable[bestOrAverage]} END DESC,
        CASE WHEN NOT ${eventsTable.higherIsBetter} THEN ${resultsTable[bestOrAverage]} END ASC
    `;
  };

  const rows = await db.execute(sql`
    WITH single_prs AS (${getPrCte("best")}), average_prs AS (${getPrCte("average")})
    SELECT s.event_id, s.best_result AS single, a.best_result AS average
    FROM single_prs s
    LEFT JOIN average_prs a ON s.event_id = a.event_id
    ORDER BY s.event_rank
  `);

  return rows.map((row: any) => {
    return {
      eventId: row.event_id,
      recordCategory,
      single: Number(row.single),
      average: row.average ? Number(row.average) : undefined,
    };
  });
}

export type PersonRecord = {
  resultId: number;
  eventId: string;
  date: Date;
  persons: PersonDetails[];
  best: number;
  average: number;
  attempts: Attempt[];
  regionalSingleRecord: string | null;
  regionalAverageRecord: string | null;
  contest: Pick<ContestResponse, "competitionId" | "shortName" | "regionCode" | "type"> | null;
  videoLink: string | null;
  discussionLink: string | null;
};

export async function getPersonRecords({
  organizationId,
  personId,
  recordCategory,
}: {
  organizationId: string;
  personId: number;
  recordCategory: RecordCategory;
}): Promise<PersonRecord[]> {
  const records = await db
    .select({
      resultId: resultsTable.id,
      eventId: eventsTable.eventId,
      date: resultsTable.date,
      persons: sql<Pick<PersonResponse, "id" | "name" | "localizedName" | "regionCode" | "wcaId">[]>`
        (SELECT ${personsArrayJsonSql} FROM ${personsTable} WHERE ${personsTable.id} = ANY(${resultsTable.personIds}))`,
      best: resultsTable.best,
      average: resultsTable.average,
      attempts: resultsTable.attempts,
      regionalSingleRecord: resultsTable.regionalSingleRecord,
      regionalAverageRecord: resultsTable.regionalAverageRecord,
      contest: {
        competitionId: contestsTable.competitionId,
        shortName: contestsTable.shortName,
        regionCode: contestsTable.regionCode,
        type: contestsTable.type,
      },
      videoLink: resultsTable.videoLink,
      discussionLink: resultsTable.discussionLink,
    })
    .from(eventsTable)
    .innerJoin(
      resultsTable,
      and(eq(eventsTable.organizationId, resultsTable.organizationId), eq(eventsTable.eventId, resultsTable.eventId)),
    )
    .innerJoin(eventCategoriesTable, eq(eventsTable.categoryId, eventCategoriesTable.id))
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
        eq(eventsTable.hidden, false),
        eq(eventCategoriesTable.hidden, false),
        eq(resultsTable.approved, true),
        eq(resultsTable.recordCategory, recordCategory),
        sql`${personId} = ANY(${resultsTable.personIds})`,
        or(isNotNull(resultsTable.regionalSingleRecord), isNotNull(resultsTable.regionalAverageRecord)),
      ),
    )
    .orderBy(desc(resultsTable.date));

  return records;
}
