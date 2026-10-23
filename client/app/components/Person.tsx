"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { slugPath } from "~/helpers/utility-functions.ts";
import type { PersonResponse } from "~/server/db/schema/persons.ts";
import Region from "./Region.tsx";

type Props = {
  person: Pick<PersonResponse, "id" | "name" | "localizedName" | "regionCode" | "wcaId"> | undefined;
  showId?: boolean;
  showLocalizedName?: boolean; // showWcaId overrides this
  noFlag?: boolean;
  noLink?: boolean;
  showWcaLink?: boolean;
};

function Person({
  person,
  showId = false,
  showLocalizedName = false,
  noFlag = false,
  noLink = false,
  showWcaLink = false,
}: Props) {
  const { slug }: { slug: string } = useParams();

  if (!person) return <span className="text-danger">Not found</span>;

  let displayText = person.name;
  if (!showId && showLocalizedName && person.localizedName) displayText += ` (${person.localizedName})`;

  return (
    <span className="tw:inline-flex tw:items-center tw:gap-2.5">
      <div>
        {noLink ? (
          <span>{displayText}</span>
        ) : (
          <Link href={slugPath(slug, `/persons/${person.id}`)} prefetch={false}>
            {displayText}
          </Link>
        )}

        {showId && (
          <div className="tw:mt-1 tw:text-nowrap tw:font-mono text-muted tw:text-xs">
            [{person.id}
            {person.wcaId ? ` | ${person.wcaId}` : ""}]
          </div>
        )}
      </div>

      {!noFlag && <Region regionCode={person.regionCode} noText />}

      {showWcaLink && person.wcaId && (
        <a
          href={`https://www.worldcubeassociation.org/persons/${person.wcaId}`}
          target="_blank"
          rel="noopener"
          className="rr-button"
        >
          <Image src="/wca_logo.svg" height={19} width={19} alt="WCA Profile" className="tw:shrink-0" />
        </a>
      )}
    </span>
  );
}

export default Person;
