import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, ownerAc } from "better-auth/plugins/organization/access";

const statement = {
  adminDashboard: ["view"],
  memberRequests: ["list", "approve", "delete"],
  modDashboard: ["view"],
  recordConfigs: ["create-and-update"],
  competitions: ["create", "update", "approve", "publish", "delete"],
  meetups: ["create", "update", "approve", "publish", "delete"],
  onlineComps: ["submit-own-result"],
  persons: ["create", "bulk-create", "update", "approve", "delete"],
  events: ["create", "update", "delete"],
  videoBasedResults: ["create", "update", "approve", "delete"],
} as const;

export const organizationAc = createAccessControl({
  ...defaultStatements,
  ...statement,
});

export type OrgPluginPermissions = Partial<{
  organization: Array<(typeof defaultStatements.organization)[number]>;
  member: Array<(typeof defaultStatements.member)[number]>;
  invitation: Array<(typeof defaultStatements.invitation)[number]>;
  // team: Array<(typeof defaultStatements.team)[number]>;
  // ac: Array<(typeof defaultStatements.ac)[number]>;

  adminDashboard: Array<(typeof statement.adminDashboard)[number]>;
  memberRequests: Array<(typeof statement.memberRequests)[number]>;
  modDashboard: Array<(typeof statement.modDashboard)[number]>;
  recordConfigs: Array<(typeof statement.recordConfigs)[number]>;
  competitions: Array<(typeof statement.competitions)[number]>;
  meetups: Array<(typeof statement.meetups)[number]>;
  onlineComps: Array<(typeof statement.onlineComps)[number]>;
  persons: Array<(typeof statement.persons)[number]>;
  events: Array<(typeof statement.events)[number]>;
  videoBasedResults: Array<(typeof statement.videoBasedResults)[number]>;
}>;

export const OrganizationRoles = ["owner", "admin", "mod", "videoBasedResultReviewer", "member"] as const;
export type OrganizationRole = (typeof OrganizationRoles)[number];

export const owner = organizationAc.newRole({
  ...ownerAc.statements,
  ...statement,
});

export const admin = organizationAc.newRole({
  ...statement,
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

export const mod = organizationAc.newRole({
  modDashboard: ["view"],
  competitions: ["create", "update"],
  meetups: ["create", "update"],
  onlineComps: ["submit-own-result"],
  persons: ["create", "update", "delete"],
  videoBasedResults: ["create"],
});

export const videoBasedResultReviewer = organizationAc.newRole({
  onlineComps: ["submit-own-result"],
  persons: ["create", "update", "delete"],
  videoBasedResults: ["create", "update", "approve", "delete"],
});

export const member = organizationAc.newRole({
  onlineComps: ["submit-own-result"],
  videoBasedResults: ["create"],
});

export const orgRolesObject: Record<OrganizationRole, string> = {
  owner: "Owner",
  admin: "Admin",
  mod: "Moderator",
  videoBasedResultReviewer: "Video-based result reviewer",
  member: "Member",
};

// These roles can be requested by an organization member
export const requestableRoles = ["mod"] as const satisfies OrganizationRole[];
