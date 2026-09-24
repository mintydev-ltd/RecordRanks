import "server-only";
import { getColumns } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { tableTimestamps } from "~/server/db/db-utils.ts";
import { organizationsTable, usersTable } from "~/server/db/schema/auth-schema.ts";
import { regionsTable } from "~/server/db/schema/regions.ts";
import { rrSchema } from "~/server/db/schema/schema.ts";

export const personsTable = rrSchema.table(
  "persons",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    organizationId: d
      .text()
      .references(() => organizationsTable.id, { onDelete: "cascade" })
      .notNull(),
    name: d.text().notNull(),
    localizedName: d.text(),
    regionCode: d.text().notNull(),
    wcaId: d.varchar({ length: 10 }),
    approved: d.boolean().default(false).notNull(),
    // Before the v0.13, createdExternally wasn't a column, and createdBy was just set to undefined if the person was created externally
    createdBy: d.text().references(() => usersTable.id, { onDelete: "set null" }),
    createdExternally: d.boolean().default(false).notNull(),
    ...tableTimestamps,
  },
  (table) => [
    d.unique("unique_persons_wca_id").on(table.organizationId, table.wcaId),
    d
      .foreignKey({
        columns: [table.organizationId, table.regionCode],
        foreignColumns: [regionsTable.organizationId, regionsTable.code],
        name: "persons_region_code_fk",
      })
      .onUpdate("cascade"),
  ],
);

export type InsertPerson = typeof personsTable.$inferInsert;
export type SelectPerson = typeof personsTable.$inferSelect;
export type PersonDetails = Pick<SelectPerson, "id" | "name" | "localizedName" | "regionCode" | "wcaId">;

const {
  organizationId: _,
  createdBy: _1,
  createdExternally: _2,
  createdAt: _3,
  updatedAt: _4,
  ...personsPublicCols
} = getColumns(personsTable);

export { personsPublicCols };

export type PersonResponse = Pick<SelectPerson, keyof typeof personsPublicCols>;
