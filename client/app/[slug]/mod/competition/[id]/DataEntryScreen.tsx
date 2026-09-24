"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useContext, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import z from "zod";
import EventImportantInfo from "~/app/[slug]/mod/competition/EventImportantInfo.tsx";
import AttemptInput from "~/app/components/AttemptInput.tsx";
import BestAndAverage from "~/app/components/BestAndAverage.tsx";
import EventButtons from "~/app/components/EventButtons.tsx";
import FormPersonInputs from "~/app/components/form/FormPersonInputs.tsx";
import FormSelect from "~/app/components/form/FormSelect.tsx";
import RoundResultsTable from "~/app/components/RoundResultsTable.tsx";
import Button from "~/app/components/UI/Button.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import { MainContext } from "~/helpers/contexts.ts";
import { useSession } from "~/helpers/hooks.ts";
import { roundFormats } from "~/helpers/roundFormats.ts";
import { roundTypes } from "~/helpers/roundTypes.ts";
import { SwrKey } from "~/helpers/swr-keys.ts";
import type { MultiChoiceOption } from "~/helpers/types/MultiChoiceOption.ts";
import type { EventWrPair, InputPerson, RoundFormat } from "~/helpers/types.ts";
import {
  clientGetHasPermission,
  getActionError,
  getBlankCompetitors,
  getFormattedResult,
  getFormattedTimeLimit,
  getMakesCutoff,
  getMaxAllowedRounds,
  getRoundDate,
  shortenEventName,
  slugPath,
} from "~/helpers/utility-functions.ts";
import { type ResultDto, ResultValidator } from "~/helpers/validators/Result.ts";
import type { SelectContest } from "~/server/db/schema/contests.ts";
import type { EventCategoryResponse } from "~/server/db/schema/event-categories.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import type { PersonResponse } from "~/server/db/schema/persons.ts";
import type { RecordConfigResponse } from "~/server/db/schema/record-configs.ts";
import type { Attempt, ResultResponse } from "~/server/db/schema/results.ts";
import type { RoundResponse } from "~/server/db/schema/rounds.ts";
import { openRoundSF } from "~/server/server-functions/contest-server-functions.ts";
import { getPersonByIdSF } from "~/server/server-functions/person-server-functions.ts";
import {
  createContestResultSF,
  deleteContestResultSF,
  getWrPairUpToDateSF,
  updateContestResultSF,
} from "~/server/server-functions/result-server-functions.ts";

type Props = {
  contest: Pick<SelectContest, "competitionId" | "shortName" | "type" | "startDate" | "schedule">;
  eventId: string;
  events: EventResponseWithCategory[];
  eventCategories: EventCategoryResponse[];
  rounds: RoundResponse[];
  results: ResultResponse[];
  persons: PersonResponse[];
  memberPerson: PersonResponse | undefined;
};

function DataEntryScreen({
  contest,
  eventId,
  events,
  eventCategories,
  rounds: initRounds,
  results: initResults,
  persons: initPersons,
  memberPerson,
}: Props) {
  const pathname = usePathname();
  const { slug }: { slug: string } = useParams();
  const { session } = useSession();
  const { changeErrorMessages, resetMessages } = useContext(MainContext);

  const { executeAsync: getWrPairUpToDate, isPending: isPendingWrPairs } = useAction(getWrPairUpToDateSF);
  const { executeAsync: getPersonById, isPending: isGettingPerson } = useAction(getPersonByIdSF);
  const { executeAsync: createResult, isPending: isCreating } = useAction(createContestResultSF);
  const { executeAsync: updateResult, isPending: isUpdating } = useAction(updateContestResultSF);
  const { executeAsync: deleteResult, isPending: isDeleting } = useAction(deleteContestResultSF);
  const { executeAsync: openRound, isPending: isOpeningRound } = useAction(openRoundSF);
  const { data: recordConfigs }: { data: RecordConfigResponse[] } = useSWR(SwrKey.RecordConfigs, { suspense: true });
  const { data: canCreateAndUpdateContests } = useSWR(session ? [SwrKey.CanCreateContests, session] : null, () =>
    clientGetHasPermission({ competitions: ["create", "update"], meetups: ["create", "update"] }),
  );
  const [resultUnderEdit, setResultUnderEdit] = useState<ResultResponse | null>(null);
  const [eventWrPair, setEventWrPair] = useState<EventWrPair | undefined>();
  const [rounds, setRounds] = useState(initRounds);
  const [round, setRound] = useState<RoundResponse>(rounds[0]); // display round 1 by default
  const [results, setResults] = useState<ResultResponse[]>(initResults);

  const roundFormat = roundFormats.find((rf) => rf.value === round.format)!;
  const currEvent = events.find((e) => e.eventId === eventId)!;

  const [selectedPersons, setSelectedPersons] = useState<InputPerson[]>(
    new Array(currEvent.participants)
      .fill(null)
      .map((val, index) => (memberPerson && index === 0 ? memberPerson : val)),
  );
  const [personNames, setPersonNames] = useState(selectedPersons.map((p) => p?.name ?? ""));
  const [attempts, setAttempts] = useState<Attempt[]>(new Array(roundFormat.attempts).fill({ result: 0 }));
  const [persons, setPersons] = useState<PersonResponse[]>(initPersons);
  const [loadingId, setLoadingId] = useState("");

  // Assumes the rounds are already in the correct order, from round 1 to finals
  const roundOptions = useMemo<MultiChoiceOption[]>(
    () => rounds.map((r) => ({ label: roundTypes[r.roundTypeId].label, value: r.roundTypeId })),
    [rounds],
  );
  const sortedResults = useMemo(
    () => results.filter((r) => r.roundId === round.id).sort((a, b) => a.ranking! - b.ranking!),
    [results, round],
  );

  const isPending = isCreating || isUpdating || isDeleting || isOpeningRound || isGettingPerson || isPendingWrPairs;
  const maxAllowedRounds = getMaxAllowedRounds(rounds, results);
  const isOpenableRound = !round.open && maxAllowedRounds >= round.roundNumber;
  const lastActiveAttempt = getMakesCutoff(attempts, round.cutoffAttemptResult, round.cutoffNumberOfAttempts)
    ? attempts.length
    : round.cutoffNumberOfAttempts!; // getMakesCutoff returns true if this is falsy anyways

  useEffect(() => {
    updateEventWrPair();
  }, []);

  // Focus the first attempt input on result edit
  useEffect(() => {
    if (resultUnderEdit) document.getElementById("attempt_1")?.focus();
  }, [resultUnderEdit]);

  const submitResult = async () => {
    const parsed = ResultValidator.safeParse({
      eventId,
      personIds: selectedPersons.map((p) => p?.id),
      attempts,
      competitionId: contest.competitionId,
      roundId: round.id,
    });

    if (!parsed.success) {
      changeErrorMessages([z.prettifyError(parsed.error)]);
    } else {
      resetMessages();
      const res = resultUnderEdit
        ? await updateResult({ id: resultUnderEdit.id, newAttempts: parsed.data.attempts })
        : await createResult({ newResultDto: parsed.data });

      if (res.serverError || res.validationErrors) {
        changeErrorMessages([getActionError(res)]);
      } else {
        if (resultUnderEdit) setResultUnderEdit(null);
        else addNewPersonsToList();
        resetSelectedPersonsAndAttempts();
        // This assumes that there is only one result per person in a given round, which should always be the case
        const result = res.data!.find(
          (r) => r.roundId === parsed.data.roundId && r.personIds.includes(parsed.data.personIds[0]),
        );
        if (!result) throw new Error("Submitted result not found in response data");
        setResults(res.data!);
        updateEventWrPair(result);
      }
    }
  };

  const addNewPersonsToList = (newSelectedPersons = selectedPersons as PersonResponse[]) => {
    const newPersons: PersonResponse[] = [
      ...persons,
      ...newSelectedPersons.filter((sp) => !persons.some((p) => p.id === sp.id)),
    ];
    setPersons(newPersons);
    setPersonNames(newPersons.map((p) => p.name));
  };

  const updateRound = (newRound: RoundResponse) => {
    setRound(newRound);
    setRounds(rounds.map((r) => (r.id === newRound.id ? newRound : r)));
    resetSelectedPersonsAndAttempts(newRound.format);
  };

  const resetSelectedPersonsAndAttempts = (newRoundFormat: RoundFormat = round.format) => {
    setAttempts(new Array(roundFormats.find((rf) => rf.value === newRoundFormat)!.attempts).fill({ result: 0 }));
    const [persons, personNames] = getBlankCompetitors(currEvent.participants);
    setSelectedPersons(persons);
    setPersonNames(personNames);
  };

  const changeAttempt = (index: number, newAttempt: Attempt) => {
    setAttempts(attempts.map((a: Attempt, i: number) => (i !== index ? a : newAttempt)));
  };

  const updateEventWrPair = async (newResult?: Pick<ResultResponse, "best" | "average">) => {
    if (
      !newResult ||
      !eventWrPair?.best ||
      newResult.best < eventWrPair.best ||
      !eventWrPair?.average ||
      newResult.average < eventWrPair.average
    ) {
      const res = await getWrPairUpToDate({
        recordCategory: contest.type === "online" ? "online" : contest.type === "meetup" ? "meetups" : "competitions",
        eventId,
        recordsUpTo: getRoundDate(round, contest),
      });

      if (res.serverError || res.validationErrors) changeErrorMessages([getActionError(res)]);
      else setEventWrPair(res.data!);
    }
  };

  const onSelectPerson = (person: PersonResponse) => {
    if (selectedPersons.every((p) => p === null)) {
      const existingResultForSelectedPerson = results.find(
        (r) => r.roundId === round.id && r.personIds.includes(person.id),
      );
      if (existingResultForSelectedPerson) onEditResult(existingResultForSelectedPerson);
    }
  };

  const onEditResult = (result: ResultResponse) => {
    resetMessages();
    setResultUnderEdit(result);
    // Fill empty attempts (e.g. the result could've previously not met cutoff and was saved with fewer attempts)
    setAttempts([...result.attempts, ...new Array(roundFormat.attempts - result.attempts.length).fill({ result: 0 })]);
    const newCurrentPersons: PersonResponse[] = result.personIds.map((pid) => persons.find((p) => p.id === pid)!);
    setSelectedPersons(newCurrentPersons);
    setPersonNames(newCurrentPersons.map((p) => p.name));
    window.scrollTo(0, 0);
  };

  const onDeleteResult = async (id: number) => {
    setLoadingId(`delete_result_${id}_button`);

    if (confirm("Are you sure you want to delete this result?")) {
      const res = await deleteResult({ id });

      if (res.serverError || res.validationErrors) {
        changeErrorMessages([getActionError(res)]);
      } else {
        const deletedResult = results.find((r) => r.id === id)!;
        setResults(res.data!);
        if (deletedResult.regionalSingleRecord || deletedResult.regionalAverageRecord) updateEventWrPair();
      }
    }

    setLoadingId("");
  };

  const openNextRound = async () => {
    const res = await openRound({ competitionId: contest.competitionId, eventId });

    if (res.serverError || res.validationErrors) changeErrorMessages([getActionError(res)]);
    else updateRound(res.data!);
  };

  const submitMockResult = async () => {
    let firstUnusedPersonId = 1;
    const resultPersons: PersonResponse[] = [];
    const participantsAlreadySelected = selectedPersons.every((p) => p !== null);
    if (participantsAlreadySelected) {
      resultPersons.push(...(selectedPersons as any));
    } else {
      for (let i = 0; i < currEvent.participants; i++) {
        while (resultPersons.length === i) {
          if (firstUnusedPersonId > 50) throw new Error("Unable to find an unused person ID");
          if (results.some((r) => r.personIds.includes(firstUnusedPersonId))) {
            firstUnusedPersonId++;
          } else {
            const res = await getPersonById({ id: firstUnusedPersonId });
            if (res.serverError || res.validationErrors) firstUnusedPersonId++;
            else resultPersons.push(res.data as PersonResponse);
          }
        }
        firstUnusedPersonId++;
      }
    }
    const attempts: Attempt[] = [];
    const skillRange = round.timeLimitCentiseconds! * 0.1 + Math.random() ** 2 * round.timeLimitCentiseconds! * 0.9;
    for (let i = 0; i < roundFormat.attempts; i++) {
      attempts.push({ result: Math.round(skillRange * 0.8 + Math.random() * skillRange * 0.2) });
      if (i + 1 === round.cutoffNumberOfAttempts && attempts.every((a) => a.result >= round.cutoffAttemptResult!))
        break;
    }

    const newResultDto: ResultDto = {
      eventId,
      personIds: resultPersons.map((p) => p.id),
      attempts,
      competitionId: contest.competitionId,
      roundId: round.id,
    };

    resetMessages();
    const res = await createResult({ newResultDto });

    if (res.serverError || res.validationErrors) {
      changeErrorMessages([getActionError(res)]);
    } else {
      addNewPersonsToList(resultPersons);
      resetSelectedPersonsAndAttempts();
      const result = res.data!.find((r) => r.roundId === round.id && r.personIds.includes(newResultDto.personIds[0]));
      if (!result) throw new Error("Submitted result not found in response data");
      setResults(res.data!);
      updateEventWrPair(result);
    }
  };

  return (
    <div className="row mx-0 mb-4 px-0">
      <div className="col-lg-3 mb-4">
        <div>
          <EventButtons events={events} eventCategories={eventCategories} eventIdOverride={eventId} showAllEvents />
          <FormSelect
            title="Round"
            options={roundOptions}
            selected={round.roundTypeId}
            setSelected={(val) => updateRound(rounds.find((r) => r.roundTypeId === val)!)}
            disabled={resultUnderEdit !== null || isPending}
            className="mb-3"
          />
          <FormPersonInputs
            title="Competitor"
            personNames={personNames}
            setPersonNames={setPersonNames}
            onSelectPerson={onSelectPerson}
            persons={selectedPersons}
            setPersons={setSelectedPersons}
            nextFocusTargetId="attempt_1"
            addNewPersonMode="default"
            redirectToOnAddPerson={`${pathname}?eventId=${eventId}`}
            disabled={!round.open || resultUnderEdit !== null || isPending}
            display="default"
            showWcaId
            forCompetitionId={contest.competitionId}
          />
          <div className="tw:mb-1 tw:flex tw:flex-col tw:gap-2">
            {attempts.map((attempt: Attempt, i: number) => (
              <AttemptInput
                // biome-ignore lint/suspicious/noArrayIndexKey: there's no other option here
                key={i}
                attNumber={i + 1}
                attempt={attempt}
                setAttempt={(val: Attempt) => changeAttempt(i, val)}
                event={currEvent}
                nextFocusTargetId={i + 1 === lastActiveAttempt ? "submit_attempt_button" : undefined}
                timeLimitCentiseconds={round.timeLimitCentiseconds}
                disabled={i + 1 > lastActiveAttempt || !round.open || isPending}
              />
            ))}
          </div>
          {isPendingWrPairs ? (
            <Loading small dontCenter />
          ) : (
            <BestAndAverage
              event={currEvent}
              roundFormat={round.format}
              attempts={attempts}
              eventWrPair={eventWrPair}
            />
          )}
          <div className="d-flex my-3 flex-wrap gap-3">
            <Button
              id="submit_attempt_button"
              onClick={submitResult}
              disabled={!round.open || isPending}
              isLoading={isCreating || isUpdating}
            >
              Submit
            </Button>
            {process.env.NODE_ENV !== "production" && (
              <Button
                onClick={submitMockResult}
                disabled={!round.open || isPending}
                isLoading={isCreating}
                className="btn-secondary"
              >
                Submit Mock Result
              </Button>
            )}
          </div>
          {round.timeLimitCentiseconds && (
            <p className="mb-2">Time limit: {getFormattedTimeLimit({ round, eventFormat: currEvent.format })}</p>
          )}
          {round.cutoffAttemptResult && (
            <p>Cutoff: {getFormattedResult(round.cutoffAttemptResult, { showDecimals: "never" })}</p>
          )}
          <EventImportantInfo importantInfo={currEvent.importantInfo} className="mt-4" />
        </div>
      </div>

      <div className="col-lg-9">
        <h3 className="mt-2 mb-4 text-center">
          <Link href={slugPath(slug, `/competitions/${contest.competitionId}`)} prefetch={false}>
            {contest.shortName}
          </Link>{" "}
          &ndash; {shortenEventName(currEvent.name)}
        </h3>

        {round.open || sortedResults.some((r) => r.roundId === round.id) ? (
          <RoundResultsTable
            event={currEvent}
            round={round}
            results={sortedResults}
            persons={persons}
            recordConfigs={recordConfigs}
            onEditResult={round.open && canCreateAndUpdateContests ? onEditResult : undefined}
            onDeleteResult={round.open && canCreateAndUpdateContests ? onDeleteResult : undefined}
            loadingId={loadingId}
            disableActions={resultUnderEdit !== null}
          />
        ) : (
          <div className="mt-5">
            {isOpenableRound ? (
              <>
                <Button onClick={openNextRound} isLoading={isOpeningRound} className="d-block mx-auto">
                  Open Round
                </Button>
                <p className="fst-italic mt-4 text-center text-danger">
                  Do NOT begin this round before opening it using the button, which checks that the round may be opened.
                  Also, please mind that manually adding/removing competitors to/from a subsequent round hasn't been
                  implemented yet.
                </p>
              </>
            ) : (
              <p className="fst-italic text-center text-warning">This round cannot be opened yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DataEntryScreen;
