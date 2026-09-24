import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SWRConfig } from "swr";
import z from "zod";
import PRsTable from "~/app/[slug]/persons/[id]/PRsTable.tsx";
import { getPersonsTabs } from "~/app/[slug]/persons/[id]/tabs.ts";
import RecordCategoriesButtonGroup from "~/app/components/RecordCategoriesButtonGroup.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import LoadingError from "~/app/components/UI/LoadingError.tsx";
import Tabs from "~/app/components/UI/Tabs.tsx";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { type RecordCategory, RecordCategoryValues } from "~/helpers/types.ts";
import { slugPath } from "~/helpers/utility-functions.ts";
import { db } from "~/server/db/provider.ts";
import { getPersonalRecords } from "~/server/server-only-functions/persons-functions.ts";
import {
  getEnabledRecordCategories,
  getEventCategories,
  getEvents,
  getOrgDetails,
} from "~/server/server-only-functions/server-only-functions.ts";

const ParamsValidator = z.strictObject({
  slug: z.string().nonempty(),
  id: z.string().nonempty(),
});
const SearchParamsValidator = z.strictObject({
  eventCategory: z.string().nullable().optional(),
  category: z.enum(RecordCategoryValues).nullable().optional(),
});

type Props = {
  params: Promise<z.infer<typeof ParamsValidator>>;
  searchParams: Promise<z.infer<typeof SearchParamsValidator>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const personId = parseInt(id, 10);

  const person = await db.query.persons.findFirst({
    columns: { name: true },
    where: { organization: { slug }, id: personId },
  });

  return {
    title: person?.name ?? "Person Profile",
    openGraph: process.env.OG_IMAGES_URL
      ? { images: [`${process.env.OG_IMAGES_URL}/${slug}/persons/${id}`] }
      : undefined,
  };
}

async function PersonPage({ params, searchParams }: Props) {
  const { slug, id } = ParamsValidator.parse(await params);
  const { eventCategory: eventCategoryParam, category } = SearchParamsValidator.parse(await searchParams);

  const urlSearchParamsWithoutCategory = new URLSearchParams();
  if (eventCategoryParam) urlSearchParamsWithoutCategory.set("eventCategory", eventCategoryParam);

  const organization = await getOrgDetails({ slug });
  const personId = parseInt(id, 10);

  const [eventCategories, events, enabledRecordCategories] = await Promise.all([
    getEventCategories({ organizationId: organization.id }),
    getEvents({ organizationId: organization.id }),
    getEnabledRecordCategories({ organizationId: organization.id }),
  ]);

  const visibleEventCategories = eventCategories.filter(
    (ec) => !ec.hidden && events.some((e) => e.categoryId === ec.id),
  );
  const selectedEventCategory =
    visibleEventCategories.find((ec) => ec.categoryId === eventCategoryParam) ?? visibleEventCategories[0];

  if (!selectedEventCategory) return <LoadingError reason="event category not found" />;

  const recordCategory: RecordCategory =
    category ?? (selectedEventCategory.videoBased ? "online" : enabledRecordCategories[0]);

  const prsPromise = getPersonalRecords({
    organizationId: organization.id,
    personId,
    eventCategoryId: selectedEventCategory.id,
    recordCategory,
  });

  return (
    <SWRConfig value={{ fallback: { [SwrKey.Events]: events } }}>
      <Tabs tabs={getPersonsTabs(slug, personId)} activeTab="prs" forServerSidePage replace />

      <div className="d-flex mb-3 flex-wrap gap-3 px-2">
        {visibleEventCategories.length > 1 && (
          // biome-ignore lint/a11y/useSemanticElements: this is the most suitable way to make a button group
          <div className="btn-group btn-group-sm" role="group">
            {visibleEventCategories.map((cat) => {
              const urlSearchParams = new URLSearchParams();
              if (category) urlSearchParams.set("category", category);
              urlSearchParams.set("eventCategory", cat.categoryId);

              return (
                <Link
                  key={cat.id}
                  href={slugPath(slug, `/persons/${personId}?${urlSearchParams}`)}
                  prefetch={false}
                  className={`btn btn-primary ${cat.categoryId === selectedEventCategory.categoryId ? "active" : ""}`}
                >
                  <span className="d-none d-md-inline">{cat.name}</span>
                  <span className="d-inline d-md-none">{cat.shortName || cat.name}</span>
                </Link>
              );
            })}
          </div>
        )}

        <RecordCategoriesButtonGroup
          pathTemplate={`${slugPath(slug, `/persons/${personId}`)}?${
            urlSearchParamsWithoutCategory.toString() ? `${urlSearchParamsWithoutCategory}&` : ""
          }category=__CATEGORY__`}
          selectedCategory={recordCategory}
          recordCategories={enabledRecordCategories}
          noTitle
        />
      </div>

      <Suspense fallback={<Loading />}>
        <PRsTable prsPromise={prsPromise} organizationSlug={slug} />
      </Suspense>
    </SWRConfig>
  );
}

export default PersonPage;
