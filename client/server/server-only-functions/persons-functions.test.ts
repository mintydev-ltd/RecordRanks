import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { gbPersonJamesStone, zaPersonKayaKhumalo } from "~/__mocks__/stubs/personsStub.ts";
import { resultsTable } from "~/server/db/schema/results.ts";
import { db } from "~/server/db/provider.ts";
import { getPersonMedalCounts } from "~/server/server-only-functions/persons-functions.ts";
import {
  testCompApr2028_333_oh_bld_team_relay_r1,
  testCompFeb2028_333_oh_bld_team_relay_r1,
  testCompJan2028_333_oh_bld_team_relay_r1,
  testCompMar2023_333_oh_bld_team_relay_r1,
  testCompMar2028_333_oh_bld_team_relay_r1,
  testMeetupFeb2023_333bf_2_person_relay_r1,
  testMeetupJan2026_333bf_2_person_relay_r1,
  testMeetupMar2028_333bf_2_person_relay_r1,
} from "~/__mocks__/stubs/roundsStub.ts";
import { reseedTestData } from "~/vitest-setup.ts";

describe("getPersonMedalCounts", () => {
  beforeAll(async () => {
    await reseedTestData();

    // Approve every podium result that involves James Stone, so that the filters can be verified:
    // - final rounds of competitions (should count)
    // - a non-final round of a competition (should NOT count)
    // - final rounds of meetups (should NOT count)
    const roundsAndRankingsToApprove: { roundId: number; ranking: number }[] = [
      { roundId: testCompMar2023_333_oh_bld_team_relay_r1.id, ranking: 1 }, // final: James gets gold
      { roundId: testCompJan2028_333_oh_bld_team_relay_r1.id, ranking: 1 }, // non-final: James gets gold
      { roundId: testCompJan2028_333_oh_bld_team_relay_r1.id, ranking: 2 }, // non-final: James gets silver
      { roundId: testCompFeb2028_333_oh_bld_team_relay_r1.id, ranking: 2 }, // final: James gets silver
      { roundId: testCompMar2028_333_oh_bld_team_relay_r1.id, ranking: 1 }, // final: James gets gold
      { roundId: testCompApr2028_333_oh_bld_team_relay_r1.id, ranking: 1 }, // final: James gets gold
      { roundId: testMeetupFeb2023_333bf_2_person_relay_r1.id, ranking: 1 }, // meetup: James gets gold
      { roundId: testMeetupJan2026_333bf_2_person_relay_r1.id, ranking: 3 }, // meetup: James gets bronze
      { roundId: testMeetupMar2028_333bf_2_person_relay_r1.id, ranking: 1 }, // meetup: James gets gold
    ];

    await Promise.all(
      roundsAndRankingsToApprove.map(({ roundId, ranking }) =>
        db
          .update(resultsTable)
          .set({ approved: true })
          .where(and(eq(resultsTable.roundId, roundId), eq(resultsTable.ranking, ranking))),
      ),
    );
  });

  it("counts only final round results from non-meetup competitions", async () => {
    // James Stone: 3 golds (Mar 2023, Mar 2028, Apr 2028 finals), 1 silver (Feb 2028 final),
    // 0 bronzes. The non-final round results and the meetup results don't count.
    const medalCounts = await getPersonMedalCounts({
      organizationId: "default",
      personId: gbPersonJamesStone.id,
    });

    expect(medalCounts).toEqual({ gold: 3, silver: 1, bronze: 0 });
  });

  it("returns zero medals for a person with no podium results", async () => {
    // Kaya Khumalo only has video-based results, which never have rankings
    const medalCounts = await getPersonMedalCounts({
      organizationId: "default",
      personId: zaPersonKayaKhumalo.id,
    });

    expect(medalCounts).toEqual({ gold: 0, silver: 0, bronze: 0 });
  });
});
