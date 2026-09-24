"use client";

import debounce from "lodash/debounce";
import { useParams, useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useContext, useState } from "react";
import useSWR from "swr";
import Person from "~/app/components/Person.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import { C } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";
import { SwrKey } from "~/helpers/swr-keys.ts";
import type { InputPerson, SpaceType } from "~/helpers/types.ts";
import { getActionError, slugPath } from "~/helpers/utility-functions.ts";
import type { PersonResponse } from "~/server/db/schema/persons.ts";
import {
  getOrCreatePersonByWcaIdSF,
  getPersonByIdSF,
  getPersonsByNameSF,
} from "~/server/server-functions/person-server-functions.ts";
import FormTextInput from "./FormTextInput.tsx";

type Props = {
  title: string;
  persons: InputPerson[];
  setPersons: (val: InputPerson[]) => void;
  personNames: string[];
  setPersonNames: (val: string[]) => void;
  onSelectPerson?: (val: PersonResponse) => void;
  addNewPersonMode: "default" | "from-new-tab" | "disabled"; // must be disabled for unauthorized users
  display: "default" | "grid" | "one-line";
  infiniteInputs?: boolean;
  nextFocusTargetId?: string;
  disabled?: boolean;
  redirectToOnAddPerson?: string;
  showWcaId?: boolean;
  forCompetitionId?: string;
};

function FormPersonInputs({
  title,
  persons,
  setPersons,
  personNames,
  setPersonNames,
  onSelectPerson,
  addNewPersonMode,
  display,
  infiniteInputs = false,
  nextFocusTargetId,
  disabled,
  redirectToOnAddPerson = "",
  showWcaId = false,
  forCompetitionId,
}: Props) {
  const router = useRouter();
  const { slug }: { slug: string } = useParams();
  const { changeErrorMessages, resetMessages } = useContext(MainContext);

  // The null element represents the option "add new person" and is only an option given to an admin/moderator
  const defaultMatchedPersons: (PersonResponse | null)[] = addNewPersonMode !== "disabled" ? [null] : [];

  const { executeAsync: getPersonsByName, isPending: isPendingPersonsByName } = useAction(getPersonsByNameSF);
  const { executeAsync: getPersonById, isPending: isPendingPersonById } = useAction(getPersonByIdSF);
  const { executeAsync: getOrCreateWcaPerson, isPending: isPendingWcaPerson } = useAction(getOrCreatePersonByWcaIdSF);
  const { data: spaceType }: { data: SpaceType } = useSWR(SwrKey.SpaceType, { suspense: true });
  const [matchedPersons, setMatchedPersons] = useState<(PersonResponse | null)[]>(defaultMatchedPersons);
  const [matchSelection, setMatchSelection] = useState(0);
  const [focusedInput, setFocusedInput] = useState<number | null>(null);

  const getMatchedPersons = useCallback(
    debounce(async (value: string) => {
      resetMessages();

      const number = Number(value);
      if (!Number.isNaN(number)) {
        const res = await getPersonById({ id: number, forCompetitionId });

        if (res.serverError || res.validationErrors) changeErrorMessages([getActionError(res)]);
        else if (Array.isArray(res.data)) setMatchedPersons(res.data);
        else setMatchedPersons([res.data!]);
      } else if (spaceType === "speedcubing" && C.wcaIdRegexLoose.test(value)) {
        const res = await getOrCreateWcaPerson({ wcaId: value.trim().toUpperCase() });

        if (res.serverError || res.validationErrors) changeErrorMessages([getActionError(res)]);
        else setMatchedPersons([res.data!.person]);
      } else {
        const res = await getPersonsByName({ name: value });

        if (res.serverError || res.validationErrors) {
          changeErrorMessages([getActionError(res)]);
        } else if (res.data!.length > 0) {
          const newMatchedPersons = [...res.data!, ...defaultMatchedPersons];
          setMatchedPersons(newMatchedPersons);
        }
      }
    }, C.fetchDebounceTimeout),
    [matchSelection, forCompetitionId],
  );

  const isPending = isPendingPersonsByName || isPendingPersonById || isPendingWcaPerson;

  const queryMatchedPersons = (value: string) => {
    setMatchedPersons(defaultMatchedPersons);
    setMatchSelection(0);

    value = value.trim();
    if (value) getMatchedPersons(value);
    else getMatchedPersons.cancel();
  };

  // This is called first on focus leave for the previous input and then on focus for the new input
  const changeFocusedInput = (inputIndex: number | null, inputValue = "") => {
    setFocusedInput(inputIndex);
    setMatchSelection(0);
    queryMatchedPersons(inputValue);
  };

  // Returns true if an input was added
  const addEmptyInputIfRequired = (newPersonNames: string[], newPersons: InputPerson[]): boolean => {
    // Add new empty input if there isn't an empty one left
    if (infiniteInputs && !newPersons.some((p) => p === null)) {
      newPersonNames.push("");
      newPersons.push(null);
      return true;
    }

    return false;
  };

  const changePersonName = (index: number, value: string) => {
    setFocusedInput(value ? index : null);

    // Update person name and reset the person object for that organizer
    const newPersonNames = personNames.map((name, i) => (i === index ? value : name));
    // This is done so that setPersons is only called if one of the persons actually had to be reset to null
    let personsUpdated = false;
    const newPersons: InputPerson[] = persons.map((p, i) => {
      if (i === index) {
        if (persons[i] !== null) personsUpdated = true;
        return null;
      }
      return p;
    });

    personsUpdated = personsUpdated || addEmptyInputIfRequired(newPersonNames, newPersons);

    setPersonNames(newPersonNames);
    if (personsUpdated) setPersons(newPersons);
    queryMatchedPersons(value);
  };

  const focusNext = (newPersons: InputPerson[]) => {
    setFocusedInput(null);
    setMatchedPersons(defaultMatchedPersons);
    setMatchSelection(0);

    // Focus on the first attempt input, if all names have been entered, or the next person input,
    // if all names haven't been entered and the last person input is not currently focused
    if (!newPersons.includes(null)) {
      if (nextFocusTargetId) document.getElementById(nextFocusTargetId)?.focus();
    } else {
      const emptyInputIndex = newPersons.indexOf(null);
      document.getElementById(`${title}_${emptyInputIndex + 1}`)?.focus();
    }
  };

  const selectPerson = (inputIndex: number, selectionIndex: number) => {
    if (!isPending) {
      if (matchedPersons[selectionIndex] === null) {
        setFocusedInput(null);

        if (addNewPersonMode === "from-new-tab") {
          open(slugPath(slug, "/mod/competitors"), "_blank");
        } else if (!redirectToOnAddPerson) {
          router.push(slugPath(slug, "/mod/competitors"));
        } else {
          router.push(slugPath(slug, `/mod/competitors?redirect=${redirectToOnAddPerson}`));
        }
      } else {
        const newSelectedPerson = matchedPersons[selectionIndex];
        const newPersons = persons.map((p, i) => (i !== inputIndex ? p : newSelectedPerson));
        const newPersonNames = personNames.map((pn, i) => (i !== inputIndex ? pn : newSelectedPerson.name));
        setPersons(newPersons);
        setPersonNames(newPersonNames);
        addEmptyInputIfRequired(newPersonNames, newPersons);
        if (onSelectPerson) onSelectPerson(newSelectedPerson);
        // Queue focus next until the next tick, because otherwise the input immediately loses focus when clicking
        setTimeout(() => focusNext(newPersons), 0);
      }
    }
  };

  const onPersonKeyDown = (inputIndex: number, e: any) => {
    if (e.key === "Enter") {
      // Make sure the focused input is not empty
      if (personNames[inputIndex]) selectPerson(inputIndex, matchSelection);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();

      if (matchSelection + 1 <= matchedPersons.length - 1) setMatchSelection(matchSelection + 1);
      else setMatchSelection(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();

      if (matchSelection - 1 >= 0) setMatchSelection(matchSelection - 1);
      else setMatchSelection(matchedPersons.length - 1);
    }
  };

  return (
    <div className={display === "grid" ? "row" : ""}>
      {personNames.map((personName: string, inputIndex: number) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: there's no other option here
        <div key={inputIndex} className={personNames.length > 1 && display === "grid" ? "col-md-6" : ""}>
          <div className={`position-relative ${display === "one-line" ? "" : "mb-2"}`}>
            <FormTextInput
              id={`${title}_${inputIndex + 1}`}
              title={personNames.length > 1 ? `${title} ${inputIndex + 1}` : title}
              tooltip={
                inputIndex !== 0
                  ? undefined
                  : spaceType === "speedcubing"
                    ? "Enter the competitor's ID or WCA ID, or part of their name"
                    : "Enter competitor's ID or part of their name"
              }
              value={personName}
              setValue={(val: string) => changePersonName(inputIndex, val)}
              onKeyDown={(e: any) => onPersonKeyDown(inputIndex, e)}
              onFocus={() => changeFocusedInput(inputIndex, personName)}
              onBlur={() => changeFocusedInput(null)}
              oneLine={display === "one-line"}
              disabled={disabled}
            />

            {inputIndex === focusedInput && personName && (
              <ul
                className={`position-absolute mt-3 list-group ${display === "one-line" ? "end-0" : ""}`}
                style={{ zIndex: 10, minWidth: display === "one-line" ? "initial" : "100%" }}
              >
                {isPending ? (
                  <li className="list-group-item">
                    <div style={{ minWidth: "200px" }}>
                      <Loading small />
                    </div>
                  </li>
                ) : matchedPersons.length > 0 ? (
                  matchedPersons.map((person: PersonResponse | null, matchIndex: number) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: there's no other option here
                      key={matchIndex}
                      className={`list-group-item ${matchIndex === matchSelection ? "active" : ""}`}
                      style={{ cursor: "pointer" }}
                      aria-current={matchIndex === matchSelection}
                      onMouseEnter={() => setMatchSelection(matchIndex)}
                      onMouseDown={() => selectPerson(inputIndex, matchIndex)}
                    >
                      {person !== null ? (
                        <Person person={person} showId showLocalizedName noLink />
                      ) : (
                        "(add new person)"
                      )}
                    </li>
                  ))
                ) : (
                  <li className="list-group-item">(competitor not found)</li>
                )}
              </ul>
            )}

            {showWcaId && persons[inputIndex]?.wcaId && (
              <div className="px-2 pt-1 font-monospace text-secondary">{persons[inputIndex].wcaId}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default FormPersonInputs;
