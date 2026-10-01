import "server-only";
import { getColumns } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { tableTimestamps } from "~/server/db/db-utils.ts";
import { organizationsTable } from "~/server/db/schema/auth-schema.ts";
import { rrSchema } from "~/server/db/schema/schema.ts";

// More groups and keys can be added here
export type SettingGroup = "default" | "page-contents" | "features" | "socials";
export type SettingKey =
  ///// Global settings /////
  // default
  | "error-logs-contact-email"
  | "kofi-goal"
  | "kofi-goal-progress"
  // page-contents
  | "privacy-policy"
  | "public-exports-readme"
  // features
  | "public-exports-to-keep"
  | "collective-cubing-enabled"
  | "scorecards-service-link"

  ///// Organization settings /////
  // default
  | "space-type"
  | "video-based-results-contact-email"
  // page-contents
  | "home-page-description"
  | "about-page-content"
  | "rules-page-content"
  | "moderator-instructions-page-content"
  | "moderator-instructions-description"
  | "video-based-results-rules"
  | "video-based-results-instructions"
  | "member-request-instructions"
  // features
  | "contest-types"
  | "video-based-results-enabled"
  | "scorecards-link-enabled"
  // socials
  | "website-link"
  | "discord-server-link"
  | "instagram-link";

export const settingsTable = rrSchema.table(
  "settings",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    organizationId: d.text().references(() => organizationsTable.id, { onDelete: "cascade" }),
    key: d.text().$type<SettingKey>().notNull(),
    group: d.text().$type<SettingGroup>(),
    value: d.text().notNull(),
    description: d.text(),
    ...tableTimestamps,
  },
  (table) => [d.unique("unique_settings_key").on(table.organizationId, table.key)],
);

export type InsertSetting = typeof settingsTable.$inferInsert;
export type SelectSetting = typeof settingsTable.$inferSelect;

const { createdAt: _, updatedAt: _1, ...settingsPublicCols } = getColumns(settingsTable);

export { settingsPublicCols };

export type SettingResponse = Pick<SelectSetting, keyof typeof settingsPublicCols>;
