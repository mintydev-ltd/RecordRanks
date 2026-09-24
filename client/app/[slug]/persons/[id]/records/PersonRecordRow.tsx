"use client";

import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import Attempts from "~/app/components/Attempts.tsx";
import EventTitle from "~/app/components/EventTitle.tsx";
import Person from "~/app/components/Person.tsx";
import RankingLinks from "~/app/components/RankingLinks.tsx";
import Region from "~/app/components/Region.tsx";
import { getAlwaysShowDecimals, getFormattedDate, getFormattedResult, slugPath } from "~/helpers/utility-functions.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import type { PersonRecord } from "~/server/server-only-functions/persons-functions.ts";

type Props = {
  record: PersonRecord;
  event: EventResponseWithCategory;
  showSingle: boolean;
  showAverage: boolean;
  hasTeamColumn: boolean;
};

function PersonRecordRow({ record, event, showSingle, showAverage, hasTeamColumn }: Props) {
  const { slug }: { slug: string } = useParams();

  const [expanded, setExpanded] = useState(false);

  return (
    <tr>
      <td>
        <EventTitle organizationSlug={slug} event={event} showIcon noMargin fontSize="6" />
      </td>
      <td>
        {showSingle &&
          getFormattedResult(record.best, {
            eventFormat: event.format,
            showDecimals: getAlwaysShowDecimals(event) ? "up-to-1h" : "default",
            showMultiPoints: true,
          })}
      </td>
      <td>{showAverage && getFormattedResult(record.average, { eventFormat: event.format, isAverage: true })}</td>
      <td>{getFormattedDate(record.date)}</td>
      {/* This is largely the same as in RankingRow */}
      <td>
        {record.contest ? (
          <span className="d-flex gap-2 align-items-center">
            <Region regionCode={record.contest.regionCode} noText />

            <Link href={slugPath(slug, `/competitions/${record.contest.competitionId}`)} prefetch={false}>
              {record.contest.shortName}
            </Link>
          </span>
        ) : (
          <RankingLinks ranking={record as any} />
        )}
      </td>
      {/* This is largely the same as in RankingRow */}
      {hasTeamColumn && (
        <td>
          {event.participants > 1 && (
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
              {expanded && record.persons.map((p) => <Person key={p.id} person={p} />)}
            </div>
          )}
        </td>
      )}
      <td>{showAverage && <Attempts event={event} attempts={record.attempts} showMultiPoints />}</td>
    </tr>
  );
}

export default PersonRecordRow;
