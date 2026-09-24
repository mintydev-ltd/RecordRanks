import Person from "~/app/components/Person.tsx";
import type { PersonResponse } from "~/server/db/schema/persons.ts";

type Props = {
  persons: (Pick<PersonResponse, "id" | "name" | "localizedName" | "regionCode" | "wcaId"> | undefined)[];
  noFlag?: boolean;
  vertical?: boolean;
  showWcaLink?: boolean;
};

function Competitors({ persons, noFlag = false, vertical = false, showWcaLink = false }: Props) {
  if (vertical) {
    return (
      <div className="tw:flex tw:flex-col tw:gap-2">
        {persons.map((person, index) =>
          person ? (
            <Person key={person.id} person={person} noFlag={noFlag} showWcaLink={showWcaLink} />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: there's no other option here
            <span key={index}>(not found)</span>
          ),
        )}
      </div>
    );
  }

  return (
    <div className="tw:flex tw:flex-wrap tw:items-start tw:gap-2">
      {persons.map((person, index) => (
        <span key={person?.id ?? index} className="tw:flex tw:gap-2">
          {person ? (
            <>
              <span className="d-none d-md-block">
                <Person
                  person={person}
                  noFlag={noFlag}
                  showLocalizedName={persons.length === 1}
                  showWcaLink={showWcaLink}
                />
              </span>
              <span className="d-md-none">
                <Person person={person} noFlag={noFlag} showWcaLink={showWcaLink} />
              </span>
            </>
          ) : (
            <span>(not found)</span>
          )}
          {index !== persons.length - 1 && <span>&</span>}
        </span>
      ))}
    </div>
  );
}

export default Competitors;
