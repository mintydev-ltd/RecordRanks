import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import Markdown from "react-markdown";
import { SWRConfig } from "swr";
import { getContestTabs } from "~/app/[slug]/competitions/[id]/tabs.ts";
import ContestControls from "~/app/[slug]/mod/ContestControls.tsx";
import ContestTypeBadge from "~/app/components/ContestTypeBadge.tsx";
import Person from "~/app/components/Person.tsx";
import Region from "~/app/components/Region.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import LoadingError from "~/app/components/UI/LoadingError.tsx";
import Tabs from "~/app/components/UI/Tabs.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import WcaCompAdditionalDetails from "~/app/components/WcaCompAdditionalDetails.tsx";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { getDateOnly, getFormattedDate } from "~/helpers/utility-functions.ts";
import { db } from "~/server/db/provider.ts";
import { contestsPublicCols, contestsTable as table } from "~/server/db/schema/contests.ts";
import { personsPublicCols, personsTable } from "~/server/db/schema/persons.ts";
import { getOrgDetails, getRegions } from "~/server/server-only-functions/server-only-functions.ts";

type Props = {
  params: Promise<{
    slug: string;
    id: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;

  const contest = await db.query.contests.findFirst({
    columns: { shortName: true },
    where: { organization: { slug }, competitionId: id },
  });

  return {
    title: contest?.shortName,
    openGraph: process.env.OG_IMAGES_URL
      ? { images: [`${process.env.OG_IMAGES_URL}/${slug}/competitions/${id}`] }
      : undefined,
  };
}

async function ContestDetailsPage({ params }: Props) {
  const { slug, id } = await params;
  const organization = await getOrgDetails({ slug });

  const [[contest], regions] = await Promise.all([
    db
      .select(contestsPublicCols)
      .from(table)
      .where(and(eq(table.organizationId, organization.id), eq(table.competitionId, id)))
      .limit(1),
    getRegions(organization.id),
  ]);

  if (!contest) return <LoadingError loadingEntity="contest" />;

  const organizers = await db
    .select(personsPublicCols)
    .from(personsTable)
    .where(inArray(personsTable.id, contest.organizerIds));

  const formattedDate = getFormattedDate(contest.startDate, contest.endDate || null);
  // Not used for competition type contests
  const formattedTime =
    contest.startTime && contest.timezone ? formatInTimeZone(contest.startTime, contest.timezone, "H:mm") : null;
  const startOfDayInVenueTZ = getDateOnly(toZonedTime(new Date(), contest.timezone ?? "UTC"))!;
  const start = new Date(contest.startDate);
  const isOngoing =
    ["approved", "ongoing"].includes(contest.state) &&
    ((!contest.endDate && start.getTime() === startOfDayInVenueTZ.getTime()) ||
      (contest.endDate && start <= startOfDayInVenueTZ && new Date(contest.endDate) >= startOfDayInVenueTZ));

  const getFormattedCoords = () => {
    const latitude = (contest.latitudeMicrodegrees / 1000000).toFixed(6);
    const longitude = (contest.longitudeMicrodegrees / 1000000).toFixed(6);

    return (
      <a
        href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=18`}
        target="_blank"
        rel="noreferrer"
      >
        {latitude}, {longitude}
      </a>
    );
  };

  return (
    <>
      <Tabs tabs={getContestTabs(slug, contest)} activeTab="details" forServerSidePage replace />

      <SWRConfig value={{ fallback: { [SwrKey.Regions]: regions } }}>
        <Suspense fallback={<Loading />}>
          <div className="row fs-5 mx-0 w-100">
            <div className="col-md-5 px-0">
              <div className="px-2">
                <div className="mb-3">
                  <ContestTypeBadge type={contest.type} />
                </div>
                <p className="mb-2">Date:&#8194;{formattedDate}</p>
                {formattedTime && <p className="mb-2">Starts at:&#8194;{formattedTime}</p>}
                {contest.type !== "online" && (
                  <p className="mb-2">
                    City:&#8194;{contest.city}, <Region regionCode={contest.regionCode} swapPositions />
                  </p>
                )}
                {contest.venue && <p className="mb-2">Venue:&#8194;{contest.venue}</p>}
                {contest.address && <p className="mb-2">Address:&#8194;{contest.address}</p>}
                {contest.type !== "online" && <p className="mb-2">Coordinates:&#8194;{getFormattedCoords()}</p>}
                {contest.contact && (
                  <p className="mb-2">
                    Contact:&#8194;<span className="fs-6">{contest.contact}</span>
                  </p>
                )}
                <div className="mb-2">
                  {organizers.length > 1 ? "Organizers" : "Organizer"}:&#8194;
                  {organizers.map((org, index) => (
                    <span key={org.id} className={`${organizers.length > 2 ? "fs-6" : "fs-5"} tw:me-1 tw:inline-flex`}>
                      <Person person={org} noFlag />
                      {index !== organizers.length - 1 && ","}
                    </span>
                  ))}
                </div>
                {contest.participants > 0 ? (
                  <p className="mb-2">
                    Number of participants:&#8194;<b>{contest.participants}</b>
                  </p>
                ) : (
                  contest.competitorLimit && (
                    <p className="mb-2">
                      Competitor limit:&#8194;<b>{contest.competitorLimit}</b>
                    </p>
                  )
                )}
              </div>
            </div>

            <hr className="d-md-none mt-2 mb-3" />

            <div className="col-md-7 px-0">
              <div className="px-2">
                <div className="mb-3">
                  <ToastMessages />
                  <ContestControls contest={contest} forPage="contest-details" />
                </div>

                {contest.state === "created" ? (
                  <p className="mb-4">This contest is currently awaiting approval</p>
                ) : isOngoing ? (
                  <p className="mb-4">This contest is currently ongoing</p>
                ) : contest.state === "finished" ? (
                  <p className="mb-4">The results for this contest are currently being checked</p>
                ) : contest.state === "removed" ? (
                  <p className="mb-4 text-danger">THIS CONTEST HAS BEEN REMOVED!</p>
                ) : undefined}

                {contest.type === "wca-comp" && (
                  <WcaCompAdditionalDetails name={contest.name} competitionId={contest.competitionId} />
                )}

                {contest.description && (
                  <>
                    <p className="fw-bold">Description:</p>
                    <div style={{ overflowX: "auto" }}>
                      <Markdown>{contest.description}</Markdown>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Suspense>
      </SWRConfig>
    </>
  );
}

export default ContestDetailsPage;
