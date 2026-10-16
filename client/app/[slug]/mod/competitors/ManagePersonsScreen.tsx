"use client";

import { faCheck, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import debounce from "lodash/debounce";
import { useParams, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useContext, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import BulkAddPersonsForm from "~/app/[slug]/mod/competitors/BulkAddPersonsForm.tsx";
import CreatorDetails from "~/app/components/CreatorDetails.tsx";
import FiltersContainer from "~/app/components/FiltersContainer.tsx";
import ContestSelect from "~/app/components/form/ContestSelect.tsx";
import FormRegionSelect from "~/app/components/form/FormRegionSelect.tsx";
import FormSelect from "~/app/components/form/FormSelect.tsx";
import FormTextInput from "~/app/components/form/FormTextInput.tsx";
import Person from "~/app/components/Person.tsx";
import Region from "~/app/components/Region.tsx";
import ActiveInactiveIcon from "~/app/components/UI/ActiveInactiveIcon.tsx";
import Button from "~/app/components/UI/Button.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import PaginationControls from "~/app/components/UI/PaginationControls.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import { C } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";
import { usePageNumber, useSession } from "~/helpers/hooks.ts";
import { SwrKey } from "~/helpers/swr-keys.ts";
import type { MultiChoiceOption } from "~/helpers/types/MultiChoiceOption.ts";
import type { Creator, ListPageMode, PaginatedData, SpaceType } from "~/helpers/types.ts";
import { clientGetHasPermission, getActionError } from "~/helpers/utility-functions.ts";
import type { ContestResponse } from "~/server/db/schema/contests.ts";
import type { SelectPerson } from "~/server/db/schema/persons.ts";
import {
  approvePersonSF,
  deletePersonSF,
  getPersonProfilesSF,
} from "~/server/server-functions/person-server-functions.ts";
import PersonForm from "./PersonForm.tsx";

const approvedFilterOptions: MultiChoiceOption[] = [
  { label: "Any", value: "" },
  { label: "Approved", value: "approved" },
  { label: "Not approved", value: "unapproved" },
];

type Props = {
  personsData: PaginatedData<SelectPerson>;
  creators: Creator[];
};

function ManagePersonsScreen({ personsData: initPersonsData, creators }: Props) {
  const { slug }: { slug: string } = useParams();
  const searchParams = useSearchParams();
  const { user, session } = useSession();
  const { changeSuccessMessage, changeErrorMessages, resetMessages } = useContext(MainContext);

  const [page, setPage] = usePageNumber();
  const { executeAsync: deletePerson, isPending: isDeleting } = useAction(deletePersonSF);
  const { executeAsync: approvePerson, isPending: isApproving } = useAction(approvePersonSF);
  const { data: spaceType }: { data: SpaceType } = useSWR(SwrKey.SpaceType, { suspense: true });
  const { data: canApprovePersons } = useSWR(
    session?.activeOrganizationId ? [SwrKey.CanApprovePersons, session] : null,
    () => clientGetHasPermission({ persons: ["approve"] }),
  );
  const [mode, setMode] = useState<ListPageMode | "add-once" | "bulk-add">(
    searchParams.get("redirect") ? "add-once" : "view",
  );
  const [personUnderEdit, setPersonUnderEdit] = useState<SelectPerson>();
  const [approvedFilter, setApprovedFilter] = useState<"approved" | "unapproved" | "">("");
  const [region, setRegion] = useState<string>(C.notSelectedOption);
  const [contestName, setContestName] = useState("");
  const [contest, setContest] = useState<ContestResponse | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState("");
  // Only used for admins. Is used to confirm approval of person with exact name and country match with a WCA person.
  const ignoredWcaMatches = useRef<{ personId: number; wcaMatches: string[] }>(undefined);

  const {
    data: personsData,
    mutate,
    isValidating,
  } = useSWR(
    ["person-profiles", search, approvedFilter, region, contest, page],
    async () => {
      const res = await getPersonProfilesSF({
        slug,
        search,
        approved: approvedFilter || undefined,
        regionCode: region === C.notSelectedOption ? undefined : region,
        competitionId: contest?.competitionId,
        page,
      });

      if (res.serverError || res.validationErrors) {
        changeErrorMessages([getActionError(res)]);
        return { entries: [], totalEntries: 0 };
      }

      return res.data!;
    },
    { fallbackData: initPersonsData, revalidateOnMount: false },
  );

  const creator = useMemo(
    () => (personUnderEdit ? (creators.find((c) => c.userId === personUnderEdit.createdBy) ?? null) : undefined),
    [personUnderEdit, creators],
  );

  const setSearchDebounced = useCallback(debounce(setSearch, C.fetchDebounceTimeout), []);

  const buttonsDisabled = mode !== "view" || isDeleting || isApproving || isValidating;

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
    setSearchDebounced(value);
  };

  const resetFilters = () => {
    setSearchDebounced.cancel();
    setSearchInput("");
    setSearch("");
    setPage(1);
    setApprovedFilter("");
    setRegion(C.notSelectedOption);
    setContestName("");
    setContest(null);
    resetMessages();
  };

  const cancel = () => {
    setMode("view");
    resetMessages();
  };

  const onAddPerson = () => {
    ignoredWcaMatches.current = undefined;
    setMode("add");
    setPersonUnderEdit(undefined);
    resetMessages();
  };

  const onBulkAddPersons = () => {
    setMode("bulk-add");
    resetMessages();
  };

  const onEditPerson = (person: SelectPerson) => {
    ignoredWcaMatches.current = undefined;
    resetMessages();
    setMode("edit");
    setPersonUnderEdit(person);
    window.scrollTo(0, 0);
  };

  const onDeletePerson = async (person: SelectPerson) => {
    ignoredWcaMatches.current = undefined;
    setLoadingId(`delete_person_${person.id}_button`);
    const res = await deletePerson({ id: person.id });
    setLoadingId("");

    if (res.serverError || res.validationErrors) {
      changeErrorMessages([getActionError(res)]);
    } else {
      mutate(
        { entries: personsData.entries.filter((p) => p.id !== person.id), totalEntries: personsData.totalEntries - 1 },
        { revalidate: false },
      );
      changeSuccessMessage(`Successfully deleted ${person.name} (ID: ${person.id})`);
    }
  };

  const onApprovePerson = async (person: SelectPerson) => {
    if (ignoredWcaMatches.current && person.id !== ignoredWcaMatches.current.personId) {
      ignoredWcaMatches.current = undefined;
    }

    setLoadingId(`approve_person_${person.id}_button`);
    const res = await approvePerson({ id: person.id, ignoredWcaMatches: ignoredWcaMatches.current?.wcaMatches });
    setLoadingId("");

    if (res.serverError || res.validationErrors) {
      if (res.serverError?.data) {
        ignoredWcaMatches.current = { personId: person.id, wcaMatches: res.serverError.data.wcaMatches };
      }
      changeErrorMessages([getActionError(res)]);
    } else {
      ignoredWcaMatches.current = undefined;
      mutate(
        { ...personsData, entries: personsData.entries.map((p) => (p.id === person.id ? res.data! : p)) },
        { revalidate: false },
      );
      changeSuccessMessage(`Successfully approved ${person.name} (ID: ${person.id})`);
    }
  };

  const updatePersons = (person: SelectPerson, { isNew }: { isNew: boolean }) => {
    if (isNew) {
      mutate();
    } else {
      mutate(
        { ...personsData, entries: personsData.entries.map((p) => (p.id === person.id ? person : p)) },
        { revalidate: false },
      );
      setMode("view");
    }
  };

  const onMerged = (mergedPerson: SelectPerson, deletedPersonId: number) => {
    const entries = personsData.entries
      .filter((p) => p.id !== deletedPersonId)
      .map((p) => (p.id === mergedPerson.id ? mergedPerson : p));
    mutate({ entries, totalEntries: personsData.totalEntries - 1 }, { revalidate: false });
    setMode("view");
  };

  return (
    <>
      <ToastMessages className="mx-2" />

      {mode === "view" ? (
        <div className="tw:flex tw:flex-wrap tw:gap-3 p-2">
          <Button onClick={onAddPerson} disabled={buttonsDisabled} className="btn-success btn-sm">
            Create person profile
          </Button>
          <Button onClick={onBulkAddPersons} disabled={buttonsDisabled} className="btn-secondary btn-sm">
            Bulk add persons
          </Button>
        </div>
      ) : mode === "bulk-add" ? (
        <BulkAddPersonsForm onCancel={cancel} />
      ) : (
        <PersonForm
          personUnderEdit={personUnderEdit}
          creator={creator}
          onSubmit={updatePersons}
          onCancel={mode !== "add-once" ? cancel : undefined}
          wcaIdInputHidden={spaceType !== "speedcubing"}
          onMerged={onMerged}
        />
      )}

      {mode !== "add-once" && (
        <>
          <FiltersContainer className="mt-4 mb-3 px-2">
            <FormTextInput
              title="Search"
              value={searchInput}
              setValue={onSearchChange}
              tooltip="Search by name, localized name, ID, or by the name or username of the creator."
              oneLine
            />
            <FormRegionSelect regionCode={region} setRegionCode={setRegion} noTitle />
            <FormSelect
              title="Status"
              options={approvedFilterOptions}
              selected={approvedFilter}
              setSelected={setApprovedFilter as any}
              oneLine
              style={{ maxWidth: "15rem" }}
            />
            <ContestSelect
              contestName={contestName}
              setContestName={setContestName}
              setContest={setContest}
              tooltip="Filter for persons who have either competed in or organized the competition"
              oneLine
            />
            {(searchInput || approvedFilter || region !== C.notSelectedOption || !!contest) && (
              <Button onClick={resetFilters} className="btn-secondary btn-sm">
                Reset
              </Button>
            )}
          </FiltersContainer>

          {isValidating ? (
            <Loading />
          ) : (
            <>
              {/* There's another one at the bottom */}
              <PaginationControls
                totalEntries={personsData.totalEntries}
                disabled={isValidating}
                className="tw:mb-3 px-2"
              />

              <div className="table-responsive overflow-y-auto">
                <table className="table-hover table text-nowrap">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Localized Name</th>
                      {spaceType === "speedcubing" && <th scope="col">WCA ID</th>}
                      <th scope="col">Country</th>
                      <th scope="col">Created by</th>
                      <th scope="col">Approved</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personsData.entries.map((person) => {
                      const personCreator = creators.find((c) => c.userId === person.createdBy) ?? null;

                      return (
                        <tr key={person.id}>
                          <td>{person.id}</td>
                          <td>
                            <Person person={person} noFlag />
                          </td>
                          <td>{person.localizedName}</td>
                          {spaceType === "speedcubing" && (
                            <td>
                              <a
                                href={`https://www.worldcubeassociation.org/persons/${person.wcaId}`}
                                target="_blank"
                                rel="noopener"
                              >
                                {person.wcaId}
                              </a>
                            </td>
                          )}
                          <td>
                            <Region regionCode={person.regionCode} shorten />
                          </td>
                          <td>
                            <CreatorDetails
                              creator={personCreator}
                              createdExternally={!!person.createdExternally}
                              isCurrentUser={person.createdBy === user?.id}
                              small
                            />
                          </td>
                          <td>
                            <ActiveInactiveIcon isActive={person.approved} />
                          </td>
                          <td>
                            <div className="d-flex gap-2">
                              {canApprovePersons && !person.approved && (
                                <Button
                                  id={`approve_person_${person.id}_button`}
                                  onClick={() => onApprovePerson(person)}
                                  disabled={buttonsDisabled}
                                  loadingId={loadingId}
                                  className="btn-xs btn-success"
                                  title="Approve"
                                  ariaLabel="Approve"
                                >
                                  <FontAwesomeIcon icon={faCheck} />
                                </Button>
                              )}
                              {(canApprovePersons || (person.createdBy === user?.id && !person.approved)) && (
                                <Button
                                  onClick={() => onEditPerson(person)}
                                  disabled={buttonsDisabled}
                                  className="btn-xs"
                                  title="Edit"
                                  ariaLabel="Edit"
                                >
                                  <FontAwesomeIcon icon={faPencil} />
                                </Button>
                              )}
                              {(canApprovePersons || (person.createdBy === user?.id && !person.approved)) && (
                                <Button
                                  id={`delete_person_${person.id}_button`}
                                  onClick={() => onDeletePerson(person)}
                                  disabled={buttonsDisabled}
                                  loadingId={loadingId}
                                  className="btn-xs btn-danger"
                                  title="Delete"
                                  ariaLabel="Delete"
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <PaginationControls totalEntries={personsData.totalEntries} disabled={isValidating} className="px-2" />
            </>
          )}
        </>
      )}
    </>
  );
}

export default ManagePersonsScreen;
