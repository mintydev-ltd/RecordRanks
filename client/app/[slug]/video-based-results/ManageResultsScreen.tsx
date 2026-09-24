"use client";

import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Attempts from "~/app/components/Attempts.tsx";
import Competitors from "~/app/components/Competitors.tsx";
import FiltersContainer from "~/app/components/FiltersContainer.tsx";
import FormPersonInputs from "~/app/components/form/FormPersonInputs.tsx";
import Time from "~/app/components/Time.tsx";
import ActiveInactiveIcon from "~/app/components/UI/ActiveInactiveIcon.tsx";
import Button from "~/app/components/UI/Button.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import { SwrKey } from "~/helpers/swr-keys.ts";
import type { InputPerson } from "~/helpers/types.ts";
import { getFormattedDate, shortenEventName, slugPath } from "~/helpers/utility-functions.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import type { RecordConfigResponse } from "~/server/db/schema/record-configs.ts";
import type { FullResult } from "~/server/db/schema/results.ts";

type Props = {
  results: FullResult[];
  events: EventResponseWithCategory[];
};

function ManageResultsScreen({ results, events }: Props) {
  const { slug }: { slug: string } = useParams();

  const { data: recordConfigs }: { data: RecordConfigResponse[] } = useSWR(SwrKey.RecordConfigs, { suspense: true });
  const [persons, setPersons] = useState<InputPerson[]>([null]);
  const [personNames, setPersonNames] = useState([""]);
  const parentRef = useRef<Element>(null);

  const filteredResults = useMemo(
    () =>
      results.filter((r) => {
        const passesCompetitorFilter = !persons[0] || r.personIds.includes(persons[0].id);
        return passesCompetitorFilter;
      }),
    [results, persons],
  );

  const rowVirtualizer = useVirtualizer({
    count: filteredResults.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 43.3333, // UPDATE THIS IF THE TR HEIGHT IN PIXELS EVER CHANGES!
    overscan: 20,
  });

  const resetFilters = () => {
    setPersons([null]);
    setPersonNames([""]);
  };

  return (
    <>
      <div className="px-2">
        <ToastMessages />

        <Link href={slugPath(slug, "/mod/competitors")} prefetch={false} className="btn btn-warning btn-sm">
          Manage Persons
        </Link>

        <p className="mt-3">
          Number of video-based results:&nbsp;<b>{filteredResults.length}</b>
          &#8194;|&#8194;Not approved:&nbsp;
          <b>{filteredResults.filter((r) => !r.approved).length}</b>
        </p>

        <FiltersContainer>
          <FormPersonInputs
            title="Competitor"
            persons={persons}
            setPersons={setPersons}
            personNames={personNames}
            setPersonNames={setPersonNames}
            disabled={results.length === 0}
            addNewPersonMode="disabled"
            display="one-line"
          />
          {persons.at(0) && (
            <Button onClick={resetFilters} className="btn-secondary btn-md">
              Reset
            </Button>
          )}
        </FiltersContainer>
      </div>

      <div ref={parentRef as any} className="table-responsive mt-3 overflow-y-auto" style={{ height: "700px" }}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          <table className="table-hover table text-nowrap">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Competitors</th>
                <th scope="col">Best</th>
                <th scope="col">Average</th>
                <th scope="col">Attempts</th>
                <th scope="col">Date</th>
                <th scope="col">Approved</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rowVirtualizer.getVirtualItems().map((virtualItem, index) => {
                if (filteredResults?.length === 0) return undefined;
                const result = filteredResults[virtualItem.index];
                const event = events.find((e) => e.eventId === result.eventId)!;

                return (
                  <tr
                    key={virtualItem.key as React.Key}
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start - index * virtualItem.size}px)`,
                    }}
                  >
                    <td>{shortenEventName(event.name)}</td>
                    <td>
                      {result.persons.length > 0 ? (
                        <Competitors persons={result.persons} vertical />
                      ) : (
                        "COMPETITOR(S) NOT FOUND"
                      )}
                    </td>
                    <td>
                      <Time result={result} event={event} recordConfigs={recordConfigs} />
                    </td>
                    <td>
                      {result.attempts.length >= 3 && (
                        <Time result={result} event={event} recordConfigs={recordConfigs} average />
                      )}
                    </td>
                    <td>
                      <Attempts event={event} attempts={result.attempts} />
                    </td>
                    <td>{getFormattedDate(result.date)}</td>
                    <td>
                      <ActiveInactiveIcon isActive={result.approved} />
                    </td>
                    <td>
                      <Link
                        href={slugPath(slug, `/video-based-results/${result.id}`)}
                        prefetch={false}
                        className="btn btn-primary btn-xs"
                        title="Edit"
                        aria-label="Edit"
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default ManageResultsScreen;
