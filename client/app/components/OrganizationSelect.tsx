"use client";

import { useRouter } from "next/navigation";
import { useContext } from "react";
import { useSWRConfig } from "swr";
import { authClient } from "~/helpers/auth-client.ts";
import { MainContext } from "~/helpers/contexts.ts";

type Props = {
  organizations: (typeof authClient.$Infer.Organization)[];
  isAdmin: boolean;
};

function OrganizationSelect({ organizations, isAdmin }: Props) {
  const router = useRouter();
  const { changeErrorMessages } = useContext(MainContext);
  const { mutate } = useSWRConfig();

  const selectOrganization = async (organization: typeof authClient.$Infer.Organization) => {
    const { error } = await authClient.organization.setActive({ organizationId: organization.id });

    // For instance admins we always want to redirect to the space
    if (error && !isAdmin) {
      changeErrorMessages([error.message ?? error.statusText]);
    } else {
      // Clear the SWR cache
      mutate(
        () => true, // update all keys
        undefined, // set cache data to undefined
        { revalidate: false },
      );
      router.push(`/${organization.slug}`);
    }
  };

  return (
    <div className="list-group">
      {organizations.map((organization) => (
        <button
          key={organization.id}
          type="button"
          onClick={() => selectOrganization(organization)}
          className="d-flex list-group-item list-group-item-action gap-3 align-items-center"
        >
          {/* biome-ignore lint/performance/noImgElement: this is necessary here */}
          {organization.logo && <img src={organization.logo} alt="Logo" className="tw:h-14" />}
          <span className="fs-5 text-body">{organization.name}</span>
          {JSON.parse(organization.metadata).private && (
            <span className="tw:icon-[tabler--eye-off] tw:text-2xl" title="Private" />
          )}
        </button>
      ))}
    </div>
  );
}

export default OrganizationSelect;
