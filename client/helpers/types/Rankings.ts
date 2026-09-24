import type { ContestResponse } from "~/server/db/schema/contests.ts";
import type { PersonDetails } from "~/server/db/schema/persons.ts";
import type { Attempt } from "~/server/db/schema/results.ts";

export type Ranking = {
  rankingId: string;
  ranking: number;
  date: Date;
  personId?: number; // only set for top persons rankings
  persons: PersonDetails[];
  result: number;
  memo: number | null; // only set for top single rankings for events that have memo
  attempts: Attempt[];
  contest: Pick<ContestResponse, "competitionId" | "shortName" | "regionCode" | "type"> | null; // only set for contest results
  videoLink: string | null; // only set for video-based results
  discussionLink: string | null; // only set for video-based results
};

export type RecordRanking = Omit<Ranking, "ranking" | "personId" | "memo" | "result"> & {
  type: "single" | "average" | "single-and-avg";
  eventId: string;
  best: number;
  average: number;
};
