"use client";

import debounce from "lodash/debounce";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useContext, useEffect, useState } from "react";
import Markdown from "react-markdown";
import AttemptInput from "~/app/components/AttemptInput.tsx";
import BestAndAverage from "~/app/components/BestAndAverage.tsx";
import CreatorDetails from "~/app/components/CreatorDetails.tsx";
import DonateButton from "~/app/components/content/DonateButton.tsx";
import Form from "~/app/components/form/Form.tsx";
import FormCheckbox from "~/app/components/form/FormCheckbox.tsx";
import FormDateInput from "~/app/components/form/FormDateInput.tsx";
import FormEventSelect from "~/app/components/form/FormEventSelect.tsx";
import FormPersonInputs from "~/app/components/form/FormPersonInputs.tsx";
import FormSelect from "~/app/components/form/FormSelect.tsx";
import FormTextInput from "~/app/components/form/FormTextInput.tsx";
import Button from "~/app/components/UI/Button.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import { C } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";
import { useSession } from "~/helpers/hooks.ts";
import { type RoundFormatObject, videoBasedFormats } from "~/helpers/roundFormats.ts";
import type { Creator, EventWrPair, InputPerson, RoundFormat } from "~/helpers/types.ts";
import { getActionError, getBlankCompetitors, getRoundFormatOptions, slugPath } from "~/helpers/utility-functions.ts";
import type { EventResponseWithCategory } from "~/server/db/schema/events.ts";
import type { PersonResponse } from "~/server/db/schema/persons.ts";
import type { Attempt, SelectResult } from "~/server/db/schema/results.ts";
import {
  createVideoBasedResultSF,
  getWrPairUpToDateSF,
  updateVideoBasedResultSF,
} from "~/server/server-functions/result-server-functions.ts";

type Props = {
  videoBasedResultsRules: string | null;
  videoBasedResultsContactEmail: string | null;
  events: EventResponseWithCategory[];
  isVideoBasedResultReviewer: boolean;
} & (
  | {
      // When submitting a new result
      result?: never;
      participants?: never;
      creator?: never;
    }
  | {
      // When editing an existing result (assumes elevated privileges)
      result: SelectResult;
      participants: PersonResponse[];
      creator: Creator | null;
    }
);

function ResultsSubmissionForm({
  videoBasedResultsRules,
  videoBasedResultsContactEmail,
  events,
  result,
  participants: initParticipants,
  creator,
  isVideoBasedResultReviewer,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { slug }: { slug: string } = useParams();
  const searchParams = useSearchParams();
  const { organization } = useSession();
  const { changeErrorMessages, changeSuccessMessage, resetMessages } = useContext(MainContext);

  const {
    executeAsync: getWrPairUpToDate,
    isPending: isPendingWrPairs,
    reset: resetGetEventWrPairsUpToDate,
  } = useAction(getWrPairUpToDateSF);
  const { executeAsync: createResult, isPending: isCreating } = useAction(createVideoBasedResultSF);
  const { executeAsync: updateResult, isPending: isUpdating } = useAction(updateVideoBasedResultSF);
  const [loadingId, setLoadingId] = useState<"UPDATING" | "APPROVING" | undefined>();
  const [eventWrPair, setEventWrPair] = useState<EventWrPair | undefined>();
  const [event, setEvent] = useState<EventResponseWithCategory>(
    events.find((e) => e.eventId === (result?.eventId ?? searchParams.get("eventId"))) ?? events[0],
  );
  const [roundFormat, setRoundFormat] = useState<RoundFormatObject>(
    result ? videoBasedFormats.find((rf) => rf.attempts === result.attempts.length)! : videoBasedFormats[0],
  );
  const [participants, setParticipants] = useState<InputPerson[]>(initParticipants ?? [null]);
  const [personNames, setPersonNames] = useState(initParticipants?.map((p) => p.name) ?? [""]);
  const [attempts, setAttempts] = useState<Attempt[]>(result?.attempts ?? []);
  // null means the date is invalid; undefined means it's empty
  const [date, setDate] = useState<Date | null | undefined>(result ? new Date(result.date) : undefined);
  const [videoLink, setVideoLink] = useState(result?.videoLink ?? "");
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [discussionLink, setDiscussionLink] = useState(result?.discussionLink ?? "");

  const updateWrPair = useCallback(
    debounce(async (eventId: string, recordsUpTo: Date) => {
      const res = await getWrPairUpToDate({
        recordCategory: "online",
        eventId,
        recordsUpTo,
        excludeResultId: result?.id,
      });

      if (res.serverError || res.validationErrors) changeErrorMessages([getActionError(res)]);
      else setEventWrPair(res.data!);
    }, C.fetchDebounceTimeout),
    [],
  );

  const isPending = isCreating || isUpdating || isPendingWrPairs;

  useEffect(() => {
    if (!result) {
      resetCompetitors((events.find((e) => e.eventId === searchParams.get("eventId")) ?? events[0]).participants);
      resetAttempts();
    }
  }, []);

  const submitResult = async (approve = false) => {
    if (participants.some((p: InputPerson) => !p)) {
      changeErrorMessages(["Invalid person(s)"]);
      return;
    }
    resetMessages();

    if (!result) {
      const res = await createResult({
        newResultDto: {
          eventId: event.eventId,
          date: date!,
          personIds: participants.map((p) => p!.id),
          attempts,
          videoLink: videoUnavailable ? null : videoLink,
          discussionLink: discussionLink || null,
        },
      });

      if (res.serverError || res.validationErrors) {
        changeErrorMessages([getActionError(res)]);
      } else {
        changeSuccessMessage("Result successfully submitted");
        setDate(undefined);
        setVideoLink("");
        setDiscussionLink("");
        resetAttempts();
        document.getElementById(event.format !== "multi" ? "attempt_1" : "attempt_1_solved")?.focus();
      }
    } else {
      setLoadingId(approve ? "APPROVING" : "UPDATING");
      const res = await updateResult({
        id: result.id,
        newResultDto: {
          date: date!,
          attempts,
          videoLink: videoUnavailable ? "" : videoLink,
          discussionLink: discussionLink || null,
        },
        approve,
      });

      if (res.serverError || res.validationErrors) {
        changeErrorMessages([getActionError(res)]);
        setLoadingId(undefined);
      } else {
        changeSuccessMessage(approve ? "Result successfully approved" : "Result successfully updated");
        setTimeout(() => router.push(slugPath(slug, "/video-based-results")), 1000);
      }
    }
  };

  const changeEvent = (newEventId: string) => {
    const newEvent = events.find((e) => e.eventId === newEventId)!;
    setEvent(newEvent);
    resetAttempts();
    if (event.participants !== newEvent.participants) resetCompetitors(newEvent.participants);
  };

  const resetCompetitors = (participants: number = event.participants) => {
    const [competitors, personNames] = getBlankCompetitors(participants);
    setParticipants(competitors);
    setPersonNames(personNames);
  };

  const changeRoundFormat = (newFormat: RoundFormat) => {
    const newRoundFormat = videoBasedFormats.find((rf) => rf.value === newFormat) as RoundFormatObject;
    setRoundFormat(newRoundFormat);
    resetAttempts(newRoundFormat.attempts);
  };

  const resetAttempts = (numberOfAttempts: number = roundFormat.attempts) => {
    setAttempts(new Array(numberOfAttempts).fill({ result: 0 }));
  };

  const changeAttempt = (index: number, newAttempt: Attempt) => {
    setAttempts(attempts.map((a: Attempt, i: number) => (i !== index ? a : newAttempt)));
  };

  const changeDate = (newDate: Date | null | undefined) => {
    setDate(newDate);

    if (newDate) {
      updateWrPair(event.eventId, newDate);
    } else {
      updateWrPair.cancel();
      resetGetEventWrPairsUpToDate();
    }
  };

  const changeVideoLink = (newValue: string) => {
    let newVideoLink: string;

    // Remove unnecessary params from youtube links
    if (newValue.includes("youtube.com") && newValue.includes("&")) {
      newVideoLink = newValue.split("&")[0];
    } else if (newValue.includes("youtu.be") && newValue.includes("?")) {
      newVideoLink = newValue.split("?")[0];
    } else {
      newVideoLink = newValue;
    }

    setVideoLink(newVideoLink);
  };

  return (
    <>
      <div className="fs-6 mx-auto mt-3 px-3" style={{ maxWidth: "900px" }}>
        {result ? (
          <p>
            Once you submit the attempt, the backend will remove future records that would have been cancelled by it.
          </p>
        ) : (
          <>
            {videoBasedResultsRules && (
              <div className="lh-lg my-4 overflow-y-auto border p-2" style={{ maxHeight: "300px" }}>
                <Markdown>
                  {videoBasedResultsContactEmail
                    ? videoBasedResultsRules.replace("{{vbrContactEmail}}", videoBasedResultsContactEmail)
                    : videoBasedResultsRules}
                </Markdown>
              </div>
            )}
            {organization?.metadata.showDonationLinks && <DonateButton />}
          </>
        )}
      </div>

      <Form hideSubmitButton className="mb-5">
        {result && (
          <CreatorDetails creator={creator} createdExternally={Boolean(result.createdExternally)} className="mb-3" />
        )}
        <FormEventSelect
          events={events}
          eventId={event.eventId}
          setEventId={(val) => changeEvent(val)}
          disabled={result !== undefined}
          className="mb-3"
        />
        <FormSelect
          title="Format"
          options={getRoundFormatOptions(videoBasedFormats)}
          selected={roundFormat.value}
          setSelected={(val) => changeRoundFormat(val as RoundFormat)}
          disabled={result !== undefined}
          className="mb-3"
        />
        <FormPersonInputs
          title="Competitor"
          personNames={personNames}
          setPersonNames={setPersonNames}
          persons={participants}
          setPersons={setParticipants}
          nextFocusTargetId={event.format !== "multi" ? "attempt_1" : "attempt_1_solved"}
          redirectToOnAddPerson={pathname}
          addNewPersonMode={isVideoBasedResultReviewer ? "default" : "disabled"}
          disabled={result !== undefined}
          display="grid"
          showWcaId
        />
        <div className="tw:mb-1 tw:flex tw:flex-col tw:gap-2">
          {attempts.map((attempt: Attempt, i: number) => (
            <AttemptInput
              // biome-ignore lint/suspicious/noArrayIndexKey: there's no other option here
              key={i}
              attNumber={i + 1}
              attempt={attempt}
              setAttempt={(val: Attempt) => changeAttempt(i, val)}
              event={event}
              memoInputForBld
              allowUnknownTime={isVideoBasedResultReviewer && ["1", "2"].includes(roundFormat.value)}
              nextFocusTargetId={i + 1 === attempts.length ? (result?.approved ? "video_link" : "date") : undefined}
            />
          ))}
        </div>
        {isPendingWrPairs ? (
          <Loading small dontCenter />
        ) : (
          <BestAndAverage event={event} roundFormat={roundFormat.value} attempts={attempts} eventWrPair={eventWrPair} />
        )}
        <FormDateInput
          id="date"
          title="Date (dd.mm.yyyy)"
          value={date}
          setValue={changeDate}
          disabled={result?.approved}
          nextFocusTargetId={videoUnavailable ? "discussion_link" : "video_link"}
          className="my-3"
        />
        <FormTextInput
          id="video_link"
          title="Link to video"
          placeholder="E.g: https://youtube.com/watch?v=xyz"
          value={videoLink}
          setValue={changeVideoLink}
          nextFocusTargetId="discussion_link"
          disabled={videoUnavailable}
          className="mb-3"
        />
        {isVideoBasedResultReviewer && (
          <FormCheckbox
            title={C.message.videoNoLongerAvailable}
            checked={videoUnavailable}
            setChecked={setVideoUnavailable}
            className="mb-3"
          />
        )}
        {videoLink && (
          <a href={videoLink} target="_blank" rel="noreferrer" className="d-block mb-3">
            Video link
          </a>
        )}
        <FormTextInput
          id="discussion_link"
          title="Link to discussion"
          placeholder="E.g: https://speedsolving.com/threads/xyz"
          value={discussionLink}
          setValue={setDiscussionLink}
          nextFocusTargetId="submit_button"
          optional
          className="mb-3"
        />
        {discussionLink && (
          <a href={discussionLink} target="_blank" rel="noreferrer" className="d-block">
            Discussion link
          </a>
        )}
        <Button
          id="submit_button"
          onClick={() => submitResult()}
          disabled={isPending}
          isLoading={isCreating || loadingId === "UPDATING"}
          className="mt-3"
        >
          Submit
        </Button>
        {result && !result.approved && (
          <Button
            id="approve_button"
            onClick={() => submitResult(true)}
            disabled={isPending}
            isLoading={loadingId === "APPROVING"}
            className="btn-success ms-3 mt-3"
          >
            Submit and approve
          </Button>
        )}
      </Form>
    </>
  );
}

export default ResultsSubmissionForm;
