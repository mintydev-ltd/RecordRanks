import { differenceInDays } from "date-fns";
import Link from "next/link";
import { C, IS_RR_INSTANCE } from "~/helpers/constants.ts";
import type { OrganizationDetails } from "~/helpers/types.ts";
import { slugPath } from "~/helpers/utility-functions.ts";

type Props = {
  organization: OrganizationDetails;
  showBillingTodo: boolean;
  showLinkPersonTodo: boolean;
  showAddEventsTodo: boolean;
  showCreateContestTodo: boolean;
};

function SpaceTodoList({
  organization,
  showBillingTodo,
  showLinkPersonTodo,
  showAddEventsTodo,
  showCreateContestTodo,
}: Props) {
  const slug = organization.slug;

  return (
    <div className="mb-4">
      <h4 className="mb-3">Getting started to-do:</h4>

      <ul className="list-unstyled">
        <SpaceTodoItem checked={!showLinkPersonTodo}>
          Create a person profile on the <Link href={slugPath(slug, "/mod/competitors")}>Manage Persons</Link> page and
          link it to your member profile on the <Link href={slugPath(slug, "/mod/members")}>Manage Members</Link> page
        </SpaceTodoItem>
        <SpaceTodoItem checked={!showAddEventsTodo}>
          Set up the <Link href={slugPath(slug, "/mod/events")}>list of events</Link> for this space
        </SpaceTodoItem>
        <SpaceTodoItem checked={!showCreateContestTodo}>
          <Link href={slugPath(slug, "/mod/competition")}>Create your first contest</Link>
        </SpaceTodoItem>
        {IS_RR_INSTANCE && (
          <SpaceTodoItem checked={!showBillingTodo}>
            Start your free trial on the <Link href={slugPath(slug, "/billing")}>Billing</Link> page to make this space
            accessible to other users
            {showBillingTodo && (
              <span className="ms-1">
                (
                <span className="fw-bold text-warning">
                  {Math.max(0, C.rrDaysBeforeStartingFreeTrial - differenceInDays(new Date(), organization.createdAt))}{" "}
                  days
                </span>{" "}
                left)
              </span>
            )}
          </SpaceTodoItem>
        )}
      </ul>
    </div>
  );
}

type SpaceTodoItemProps = {
  checked: boolean;
  children: React.ReactNode;
};

function SpaceTodoItem({ checked, children }: SpaceTodoItemProps) {
  return (
    <li className="tw:mb-2">
      <div className="tw:flex tw:items-center tw:gap-2">
        {checked ? (
          <span
            className="tw:icon-[tabler--checkbox] tw:shrink-0 tw:text-amber-500 tw:text-xl"
            title="Checkbox checked"
          />
        ) : (
          <span className="tw:icon-[tabler--square] tw:ms-px tw:shrink-0 tw:text-lg" title="Checkbox unchecked" />
        )}
        <span className={checked ? "text-muted tw:line-through" : ""}>{children}</span>
      </div>
    </li>
  );
}

export default SpaceTodoList;
