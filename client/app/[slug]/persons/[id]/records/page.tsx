import { Suspense } from "react";
import { SWRConfig } from "swr";
import z from "zod";
import PersonRecordsTable from "~/app/[slug]/persons/[id]/records/PersonRecordsTable.tsx";
import { getPersonsTabs } from "~/app/[slug]/persons/[id]/tabs.ts";
import RecordCategoriesButtonGroup from "~/app/components/RecordCategoriesButtonGroup.tsx";
import Loading from "~/app/components/UI/Loading.tsx";
import Tabs from "~/app/components/UI/Tabs.tsx";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { type RecordCategory, RecordCategoryValues } from "~/helpers/types.ts";
import { slugPath } from "~/helpers/utility-functions.ts";
import { getPersonRecords } from "~/server/server-only-functions/persons-functions.ts";
import {
  getEnabledRecordCategories,
  getEvents,
  getOrgDetails,
  getRecordConfigs,
} from "~/server/server-only-functions/server-only-functions.ts";

const ParamsValidator = z.strictObject({
  slug: z.string().nonempty(),
  id: z.string().nonempty(),
});
const SearchParamsValidator = z.strictObject({
  category: z.enum(RecordCategoryValues).nullable().optional(),
});

type Props = {
  params: Promise<z.infer<typeof ParamsValidator>>;
  searchParams: Promise<z.infer<typeof SearchParamsValidator>>;
};

async function PersonRecordsPage({ params, searchParams }: Props) {
  const { slug, id } = ParamsValidator.parse(await params);
  const { category } = SearchParamsValidator.parse(await searchParams);

  const organization = await getOrgDetails({ slug });
  const personId = parseInt(id, 10);

  const [events, enabledRecordCategories] = await Promise.all([
    getEvents({ organizationId: organization.id }),
    getEnabledRecordCategories({ organizationId: organization.id }),
  ]);

  const recordCategory: RecordCategory = category ?? enabledRecordCategories[0];

  const recordsPromise = getPersonRecords({ organizationId: organization.id, personId, recordCategory });
  const recordConfigsPromise = getRecordConfigs(organization!.id, { recordCategory: "online" });

  return (
    <SWRConfig value={{ fallback: { [SwrKey.RecordConfigs]: recordConfigsPromise } }}>
      <Tabs tabs={getPersonsTabs(slug, personId)} activeTab="records" forServerSidePage replace />

      <div className="d-flex mb-3 flex-wrap gap-3 px-2">
        <RecordCategoriesButtonGroup
          pathTemplate={`${slugPath(slug, `/persons/${personId}/records`)}?category=__CATEGORY__`}
          selectedCategory={recordCategory}
          recordCategories={enabledRecordCategories}
          noTitle
        />
      </div>

      <Suspense fallback={<Loading />}>
        <PersonRecordsTable recordCategory={recordCategory} recordsPromise={recordsPromise} events={events} />
      </Suspense>
    </SWRConfig>
  );
}

export default PersonRecordsPage;
