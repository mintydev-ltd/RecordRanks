import type { Metadata } from "next";
import { Suspense } from "react";
import { SWRConfig } from "swr";
import z from "zod";
import PersonsSearch from "~/app/[slug]/persons/PersonsSearch.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { getOrgDetails, getRegions, getSettingFromDb } from "~/server/server-only-functions/server-only-functions.ts";

const ParamsValidator = z.strictObject({
  slug: z.string().nonempty(),
});

type Props = {
  params: Promise<z.infer<typeof ParamsValidator>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  return {
    title: "Persons",
    description: process.env.METADATA_PERSONS_DESCRIPTION,
    openGraph: process.env.OG_IMAGES_URL ? { images: [`${process.env.OG_IMAGES_URL}/${slug}/persons`] } : undefined,
  };
}

async function PersonsPage({ params }: Props) {
  const { slug } = ParamsValidator.parse(await params);

  const organization = await getOrgDetails({ slug });
  const regionsPromise = getRegions(organization.id);
  const spaceTypePromise = getSettingFromDb({ key: "space-type", organizationId: organization!.id });

  return (
    <SWRConfig value={{ fallback: { [SwrKey.SpaceType]: spaceTypePromise, [SwrKey.Regions]: regionsPromise } }}>
      <section>
        <h2 className="mb-4 text-center">Persons</h2>

        <ToastMessages className="mx-2" />

        <Suspense fallback={<Loading />}>
          <PersonsSearch slug={slug} />
        </Suspense>
      </section>
    </SWRConfig>
  );
}

export default PersonsPage;
