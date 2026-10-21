import { SWRConfig } from "swr";
import z from "zod";
import Region from "~/app/components/Region.tsx";
import LoadingError from "~/app/components/UI/LoadingError.tsx";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { db } from "~/server/db/provider.ts";
import { getPersonMedalCounts } from "~/server/server-only-functions/persons-functions.ts";
import { getOrgDetails, getRegions } from "~/server/server-only-functions/server-only-functions.ts";

const ParamsValidator = z.strictObject({
  slug: z.string().nonempty(),
  id: z.string().nonempty(),
});

type Props = {
  children: React.ReactNode;
  params: Promise<z.infer<typeof ParamsValidator>>;
};

async function PersonLayout({ children, params }: Props) {
  const { slug, id } = ParamsValidator.parse(await params);
  const organization = await getOrgDetails({ slug });
  const personId = parseInt(id, 10);

  const [person, regions, medalCounts] = await Promise.all([
    db.query.persons.findFirst({ where: { organizationId: organization.id, id: personId } }),
    getRegions(organization.id),
    getPersonMedalCounts({ organizationId: organization.id, personId }),
  ]);

  if (!person) return <LoadingError loadingEntity="person" />;

  return (
    <SWRConfig value={{ fallback: { [SwrKey.Regions]: regions } }}>
      <section>
        <div className="tw:px-4">
          <div className="card tw:mx-auto tw:mb-6 tw:max-w-2xl rounded-3 tw:shadow-sm">
            <div className="card-body">
              <h2 className="mb-0 tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-4">
                {person.name}
                {person.localizedName && <span className="fs-5 text-muted">{person.localizedName}</span>}
              </h2>
            </div>

            <div className="card-footer">
              <div className="fs-6 tw:flex tw:flex-wrap tw:justify-center tw:gap-x-5 tw:gap-y-2 tw:md:gap-x-8">
                <div className="tw:flex tw:items-center tw:gap-2">
                  <span className="text-muted">ID:</span>
                  <strong>{person.id}</strong>
                </div>

                <Region regionCode={person.regionCode} shorten />

                {person.wcaId && (
                  <div className="tw:flex tw:items-center tw:gap-2">
                    <span className="text-muted">WCA ID:</span>
                    <a
                      href={`https://www.worldcubeassociation.org/persons/${person.wcaId}`}
                      target="_blank"
                      rel="noopener"
                    >
                      {person.wcaId}
                    </a>
                  </div>
                )}

                {(medalCounts.gold > 0 || medalCounts.silver > 0 || medalCounts.bronze > 0) && (
                  <div
                    className="tw:flex tw:items-center tw:gap-3"
                    title="Podium finishes in final rounds of competitions"
                  >
                    <span className="tw:flex tw:items-center tw:gap-1" title="First places">
                      🥇 <strong>{medalCounts.gold}</strong>
                    </span>
                    <span className="tw:flex tw:items-center tw:gap-1" title="Second places">
                      🥈 <strong>{medalCounts.silver}</strong>
                    </span>
                    <span className="tw:flex tw:items-center tw:gap-1" title="Third places">
                      🥉 <strong>{medalCounts.bronze}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {children}
      </section>
    </SWRConfig>
  );
}

export default PersonLayout;
