"use client";

import { use } from "react";
import useSWR from "swr";
import { SwrKey } from "~/helpers/swr-keys.ts";
import type { RecordCategory } from "~/helpers/types.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import type { RecordConfigResponse } from "~/server/db/schema/record-configs.ts";
import type { RegionResponse } from "~/server/db/schema/regions.ts";
import type { PersonRecord } from "~/server/server-only-functions/persons-functions.ts";
import PersonRecordRow from "./PersonRecordRow.tsx";

type Props = {
  recordCategory: RecordCategory;
  recordsPromise: Promise<PersonRecord[]>;
  events: EventResponseWithCategory[];
};

function PersonRecordsTable({ recordCategory, recordsPromise, events }: Props) {
  const records = use(recordsPromise);

  const { data: recordConfigs }: { data: RecordConfigResponse[] } = useSWR(SwrKey.RecordConfigs, { suspense: true });
  const { data: regions }: { data: RegionResponse[] } = useSWR(SwrKey.Regions, { suspense: true });

  if (records.length === 0) return <p className="fs-5 mx-2 mt-4">No records found for this record category</p>;

  const tables: { type: "WR" | "CR" | "NR"; title: string }[] = [
    { type: "WR", title: "World Records" },
    { type: "CR", title: "Continental Records" },
    { type: "NR", title: "National Records" },
  ];

  const getRecordTypeMatches = (recordTypeId: string | null, tableType: "WR" | "CR" | "NR"): boolean => {
    const recordConfig = recordConfigs.find((rc) => rc.recordTypeId === recordTypeId);
    if (!recordConfig?.active) return false;
    if (tableType === "WR") return recordTypeId === "WR";
    if (tableType === "NR") return recordTypeId === "NR";
    const superRegion = regions.find((r) => r.type === "super-region" && r.superRegionRecordType === recordTypeId);
    return superRegion !== undefined;
  };

  return (
    <div className="mt-4">
      {tables.map(({ type, title }) => {
        const tableRecords = records.filter(
          (r) =>
            getRecordTypeMatches(r.regionalSingleRecord, type) || getRecordTypeMatches(r.regionalAverageRecord, type),
        );
        if (tableRecords.length === 0) return null;

        const hasTeamEvent = tableRecords.some((r) => {
          const event = events.find((e) => e.eventId === r.eventId);
          return event && event.participants > 1;
        });

        return (
          <div key={type} className="mb-4">
            <h4 className="mb-2">{title}</h4>

            <div className="table-responsive flex-grow-1">
              <table className="table-hover table-responsive table text-nowrap">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Best</th>
                    <th>Average</th>
                    <th>Date</th>
                    <th>{recordCategory === "online" ? "Link" : "Contest"}</th>
                    {hasTeamEvent && <th>Team</th>}
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRecords.map((record) => (
                    <PersonRecordRow
                      key={`${record.resultId}_${type}`}
                      record={record}
                      event={events.find((e) => e.eventId === record.eventId)!}
                      showSingle={getRecordTypeMatches(record.regionalSingleRecord, type)}
                      showAverage={getRecordTypeMatches(record.regionalAverageRecord, type)}
                      hasTeamColumn={hasTeamEvent}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PersonRecordsTable;
