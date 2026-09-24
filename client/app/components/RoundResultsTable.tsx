import { faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Attempts from "~/app/components/Attempts.tsx";
import Competitors from "~/app/components/Competitors.tsx";
import Time from "~/app/components/Time.tsx";
import Button from "~/app/components/UI/Button.tsx";
import { C, IS_CUBING_CONTESTS_INSTANCE } from "~/helpers/constants.ts";
import { roundFormats } from "~/helpers/roundFormats.ts";
import { getIsProceedableResult } from "~/helpers/utility-functions.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import type { PersonResponse } from "~/server/db/schema/persons.ts";
import type { RecordConfigResponse } from "~/server/db/schema/record-configs.ts";
import type { ResultResponse } from "~/server/db/schema/results.ts";
import type { RoundResponse } from "~/server/db/schema/rounds.ts";

type Props = {
  event: EventResponseWithCategory;
  round: RoundResponse;
  results: ResultResponse[];
  persons: PersonResponse[];
  recordConfigs: RecordConfigResponse[];
} & (
  | {
      onEditResult?: never;
      onDeleteResult?: never;
      loadingId?: never;
      disableActions?: never;
    }
  | {
      onEditResult: ((result: ResultResponse) => void) | undefined;
      onDeleteResult: ((resultId: number) => void) | undefined;
      loadingId: string;
      disableActions: boolean;
    }
);

function RoundResultsTable({
  event,
  round,
  results,
  persons,
  recordConfigs,
  // If one of these is defined, the other must be defined too
  onEditResult,
  onDeleteResult,
  loadingId,
  disableActions,
}: Props) {
  const roundFormat = roundFormats.find((rf) => rf.value === round.format)!;
  const roundCanHaveAverage = roundFormat.attempts >= 3;
  let lastRanking = 0;

  // Gets green highlight styling if the result is not DNF/DNS and made podium or is good enough to proceed to the next round
  const getRankingHighlight = (result: ResultResponse) => {
    if (
      result.proceeds ||
      (round.roundTypeId === "f" && result.ranking! <= 3 && getIsProceedableResult(result, roundFormat))
    ) {
      return { color: "black", background: C.color.rankingHighlight };
    }

    return {};
  };

  if (results.length === 0) return <p className="mx-2 mt-5 text-center">There are no results from this round yet</p>;

  return (
    <div className="table-responsive flex-grow-1">
      <table className="table-hover table-responsive table text-nowrap">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Name</th>
            <th scope="col">Best</th>
            {roundCanHaveAverage && (
              <th scope="col">{roundFormat.bestAndWorstAttemptsToExclude > 0 ? "Average" : "Mean"}</th>
            )}
            <th scope="col">Attempts</th>
            {onDeleteResult && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {results.map((result: ResultResponse) => {
            const isTie = result.ranking === lastRanking;
            lastRanking = result.ranking!;

            return (
              <tr key={result.id}>
                <td className="ps-2" style={getRankingHighlight(result)}>
                  <span className={isTie ? "text-secondary" : ""}>{result.ranking}</span>
                </td>
                <td>
                  <Competitors
                    persons={result.personIds.map((pid) => persons.find((p) => p.id === pid))}
                    showWcaLink={IS_CUBING_CONTESTS_INSTANCE}
                  />
                </td>
                <td>
                  <Time result={result} event={event} recordConfigs={recordConfigs} />
                </td>
                {roundCanHaveAverage && (
                  <td>
                    {result.average !== 0 && (
                      <Time result={result} event={event} recordConfigs={recordConfigs} average />
                    )}
                  </td>
                )}
                <td>
                  <Attempts event={event} attempts={result.attempts} />
                </td>
                {onEditResult && onDeleteResult && (
                  <td>
                    <div className="d-flex gap-2">
                      <Button
                        id={`edit_result_${result.id}_button`}
                        onClick={() => onEditResult(result)}
                        loadingId={loadingId}
                        disabled={disableActions}
                        className="btn-xs"
                        title="Edit"
                        ariaLabel="Edit"
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </Button>
                      <Button
                        id={`delete_result_${result.id}_button`}
                        onClick={() => onDeleteResult(result.id)}
                        loadingId={loadingId}
                        disabled={disableActions}
                        className="btn-danger btn-xs"
                        title="Delete"
                        ariaLabel="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default RoundResultsTable;
