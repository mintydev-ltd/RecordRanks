import DonateButton from "~/app/components/content/DonateButton.tsx";
import DonationGoals from "~/app/components/content/DonationGoals.tsx";
import { C } from "~/helpers/constants.ts";
import type { OrganizationDetails } from "~/helpers/types.ts";
import { getSettingFromDb } from "~/server/server-only-functions/server-only-functions.ts";

type Props = {
  organization: OrganizationDetails;
};

async function DonateSection({ organization }: Props) {
  if (!organization.metadata.showDonationLinks) return;

  const [kofiGoal, kofiGoalProgress] = await Promise.all([
    getSettingFromDb({ key: "kofi-goal", organizationId: null, optional: true }),
    getSettingFromDb({ key: "kofi-goal-progress", organizationId: null, optional: true }),
  ]);

  return (
    <>
      <h3 className="rr-basic-heading">Support RecordRanks</h3>
      <p>
        {organization.name} is powered by RecordRanks, an{" "}
        <a href={C.sourceCodeLink} target="_blank" rel="noreferrer">
          open source project
        </a>{" "}
        created for the benefit of hobby sports communities. You can contribute through the{" "}
        <a href={C.rrDonationLink} target="_blank" rel="noreferrer">
          Ko-fi page
        </a>{" "}
        without creating an account. All contributions directly support the development of RecordRanks.
      </p>
      <DonateButton />

      {kofiGoal && <DonationGoals kofiGoal={kofiGoal} kofiGoalProgress={kofiGoalProgress || "0"} />}
    </>
  );
}

export default DonateSection;
