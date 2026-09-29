import { Suspense } from "react";
import z from "zod";
import { getPersonsTabs } from "~/app/[slug]/persons/[id]/tabs.ts";
import ContestsTable from "~/app/components/ContestsTable.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import Tabs from "~/app/components/UI/Tabs.tsx";
import { getContests } from "~/server/server-only-functions/contests-functions.ts";
import { getOrgDetails } from "~/server/server-only-functions/server-only-functions.ts";

const ParamsValidator = z.strictObject({
  slug: z.string().nonempty(),
  id: z.string().nonempty(),
});

type Props = {
  params: Promise<z.infer<typeof ParamsValidator>>;
};

async function PersonCompetitionsPage({ params }: Props) {
  const { slug, id } = ParamsValidator.parse(await params);
  const personId = parseInt(id, 10);

  const organization = await getOrgDetails({ slug });

  const contestsPromise = getContests({ organizationId: organization.id, competitorPersonId: personId });

  return (
    <>
      <Tabs tabs={getPersonsTabs(slug, personId)} activeTab="competitions" forServerSidePage replace />

      <Suspense fallback={<Loading />}>
        <ContestsTable contestsPromise={contestsPromise} />
      </Suspense>
    </>
  );
}

export default PersonCompetitionsPage;
