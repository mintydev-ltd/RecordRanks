import { Suspense } from "react";
import { SWRConfig } from "swr";
import ResultsSubmissionForm from "~/app/[slug]/video-based-results/ResultsSubmissionForm.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { auth } from "~/server/auth.ts";
import {
  authorizeUser,
  getRecordConfigs,
  getRegions,
  getSettingFromDb,
  getVideoBasedEvents,
} from "~/server/server-only-functions/server-only-functions.ts";

async function SubmitResultsPage() {
  const { organization, httpHeaders } = await authorizeUser({
    useOrganization: true,
    orgPermissions: { videoBasedResults: ["create"] },
  });

  const [
    videoBasedResultsEnabled,
    videoBasedResultsRules,
    videoBasedResultsContactEmail,
    events,
    { success: isVideoBasedResultReviewer },
  ] = await Promise.all([
    getSettingFromDb({ key: "video-based-results-enabled", organizationId: organization!.id }),
    getSettingFromDb({ key: "video-based-results-rules", organizationId: organization!.id, optional: true }),
    getSettingFromDb({ key: "video-based-results-contact-email", organizationId: organization!.id, optional: true }),
    getVideoBasedEvents(organization!.id),
    auth.api.hasPermission({
      headers: httpHeaders,
      body: { permissions: { videoBasedResults: ["update", "approve", "delete"] } },
    }),
  ]);

  if (videoBasedResultsEnabled !== "true")
    return <p className="fs-4 mx-3 mt-5 text-center">Video-based results are disabled</p>;

  return (
    <section>
      <h2 className="text-center">Submit Results</h2>

      <SWRConfig
        value={{
          fallback: {
            [SwrKey.SpaceType]: getSettingFromDb({ key: "space-type", organizationId: organization!.id }),
            [SwrKey.Regions]: getRegions(organization!.id),
            [SwrKey.RecordConfigs]: getRecordConfigs(organization!.id, { recordCategory: "online" }),
          },
        }}
      >
        <Suspense fallback={<Loading />}>
          <ResultsSubmissionForm
            videoBasedResultsRules={videoBasedResultsRules}
            videoBasedResultsContactEmail={videoBasedResultsContactEmail}
            events={events}
            isVideoBasedResultReviewer={isVideoBasedResultReviewer}
          />
        </Suspense>
      </SWRConfig>
    </section>
  );
}

export default SubmitResultsPage;
