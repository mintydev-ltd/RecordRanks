import { getAlwaysShowDecimals, getFormattedResult } from "~/helpers/utility-functions.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import type { Attempt } from "~/server/db/schema/results.ts";

type Props = {
  event: Pick<EventResponseWithCategory, "format" | "category">;
  attempts: Attempt[];
  showMultiPoints?: boolean;
};

function Attempts({ event, attempts, showMultiPoints = false }: Props) {
  const best = Math.min(...attempts.map((a) => (a.result > 0 ? a.result : Infinity)));
  const worst = attempts.find((a) => a.result < 0)?.result ?? Math.max(...attempts.map((a) => a.result));
  const isAllDnfOrDnsAttempts = best === Infinity;
  let bestAttempt: number | undefined;
  let worstAttempt: number | undefined;

  return (
    <div className="d-flex gap-2">
      {attempts.map((attempt, index) => {
        const formattedTime = getFormattedResult(attempt.result, {
          eventFormat: event.format,
          showDecimals: getAlwaysShowDecimals(event) ? "up-to-1h" : "default",
          showMultiPoints,
        });

        if (isAllDnfOrDnsAttempts || attempts.length < 5 || attempts.some((a) => a.result === 0))
          // biome-ignore lint/suspicious/noArrayIndexKey: there's no other option here
          return <span key={index}>{formattedTime}</span>;

        if (bestAttempt === undefined && attempt.result === best) bestAttempt = index;
        if (bestAttempt !== index && worstAttempt === undefined && attempt.result === worst) worstAttempt = index;
        const addParentheses = index === bestAttempt || index === worstAttempt;

        // biome-ignore lint/suspicious/noArrayIndexKey: there's no other option here
        return <span key={index}>{`${addParentheses ? "(" : ""}${formattedTime}${addParentheses ? ")" : ""}`}</span>;
      })}
    </div>
  );
}

export default Attempts;
