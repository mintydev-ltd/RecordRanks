"use client";

import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import Attempts from "~/app/components/Attempts.tsx";
import Competitors from "~/app/components/Competitors.tsx";
import Person from "~/app/components/Person.tsx";
import RankingLinks from "~/app/components/RankingLinks.tsx";
import Region from "~/app/components/Region.tsx";
import type { Ranking } from "~/helpers/types/Rankings.ts";
import { getAlwaysShowDecimals, getFormattedDate, getFormattedResult, slugPath } from "~/helpers/utility-functions.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";

type Props = {
  event: Pick<EventResponseWithCategory, "name" | "format" | "category">;
  type: "single" | "average";
  ranking: Ranking;
  isTiedRanking: boolean;
  showAllTeammates: boolean;
  showTeamColumn: boolean;
  showDetailsColumn: boolean;
};

function RankingRow({
  type,
  ranking,
  isTiedRanking,
  event,
  showAllTeammates = false,
  showTeamColumn = false,
  showDetailsColumn = false,
}: Props) {
  const { slug }: { slug: string } = useParams();

  const [expanded, setExpanded] = useState(false);

  const personsToDisplay = showAllTeammates
    ? ranking.persons
    : [ranking.personId ? ranking.persons.find((p) => p.id === ranking.personId)! : ranking.persons[0]];
  const result = getFormattedResult(ranking.result, {
    eventFormat: event.format,
    showDecimals: getAlwaysShowDecimals(event) ? "up-to-1h" : "default",
    showMultiPoints: true,
    isAverage: type === "average",
  });

  return (
    <tr>
      <td>
        <span className={isTiedRanking ? "text-secondary" : ""}>{ranking.ranking}</span>
      </td>
      <td>
        <Competitors persons={personsToDisplay} noFlag={!showAllTeammates} />
      </td>
      <td>{result}</td>
      {!showAllTeammates && (
        <td>
          <Region regionCode={personsToDisplay[0].regionCode} shorten />
        </td>
      )}
      <td>{getFormattedDate(ranking.date)}</td>
      {/* This is largely the same as in PersonRecordRow */}
      <td>
        {ranking.contest ? (
          <span className="d-flex gap-2 align-items-center">
            <Region regionCode={ranking.contest.regionCode} noText />

            <Link href={slugPath(slug, `/competitions/${ranking.contest.competitionId}`)} prefetch={false}>
              {ranking.contest.shortName}
            </Link>
          </span>
        ) : (
          <RankingLinks ranking={ranking} />
        )}
      </td>
      {/* This is largely the same as in PersonRecordRow */}
      {showTeamColumn && (
        <td>
          <div className="d-flex fs-6 flex-column gap-2">
            <span className="align-self-end">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                title={expanded ? "Collapse" : "Expand"}
                className="fs-5 border-0 bg-transparent p-0"
                style={{ cursor: "pointer" }}
              >
                <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />
              </button>
            </span>

            {expanded && ranking.persons.map((p) => <Person key={p.id} person={p} />)}
          </div>
        </td>
      )}
      {showDetailsColumn && (
        <td>
          {type === "average" ? (
            <Attempts event={event} attempts={ranking.attempts} showMultiPoints />
          ) : (
            ranking.memo && `${getFormattedResult(ranking.memo, { showDecimals: "never" })} memo`
          )}
        </td>
      )}
    </tr>
  );
}

export default RankingRow;
