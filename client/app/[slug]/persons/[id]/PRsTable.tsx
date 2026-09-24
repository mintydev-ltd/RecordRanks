"use client";

import { use } from "react";
import useSWR from "swr";
import EventTitle from "~/app/components/EventTitle.tsx";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { getAlwaysShowDecimals, getFormattedResult } from "~/helpers/utility-functions.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import type { PersonalRecordPair } from "~/server/server-only-functions/persons-functions.ts";

type Props = {
  prsPromise: Promise<PersonalRecordPair[]>;
  organizationSlug: string;
};

function PRsTable({ prsPromise, organizationSlug }: Props) {
  const prs = use(prsPromise);

  const { data: events }: { data: EventResponseWithCategory[] } = useSWR(SwrKey.Events, { suspense: true });

  if (prs.length === 0) return <p className="fs-5 mx-2 mt-4">No personal records found for this event category</p>;

  return (
    <div className="table-responsive flex-grow-1">
      <table className="table-hover table-responsive table text-nowrap">
        <thead>
          <tr>
            <th>Event</th>
            <th>Single</th>
            <th>Average</th>
          </tr>
        </thead>
        <tbody>
          {prs.map((pr) => {
            const event = events.find((e) => e.eventId === pr.eventId)!;
            const showDecimals = getAlwaysShowDecimals({ format: event.format, category: event.category })
              ? "up-to-1h"
              : "default";

            return (
              <tr key={event.eventId}>
                <td>
                  <EventTitle
                    organizationSlug={organizationSlug}
                    event={event}
                    showIcon
                    linkToRankings={`?category=${pr.recordCategory}`}
                    noMargin
                    fontSize="6"
                  />
                </td>
                <td>
                  {getFormattedResult(pr.single, { eventFormat: event.format, showDecimals, showMultiPoints: true })}
                </td>
                <td>
                  {pr.average &&
                    getFormattedResult(pr.average, {
                      eventFormat: event.format,
                      showDecimals,
                      showMultiPoints: true,
                      isAverage: true,
                    })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default PRsTable;
