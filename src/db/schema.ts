import { pgTable } from "drizzle-orm/pg-core";

export const files = pgTable("files", (t) => ({
	id: t.varchar({ length: 32 }).primaryKey(),
	name: t.varchar({ length: 255 }).notNull(),
	encodedName: t.varchar({ length: 255 }).notNull(),
	extension: t.varchar({ length: 10 }),
	size: t.bigint({ mode: "number" }).notNull(),
	location: t.varchar({ length: 255 }).notNull(),
	locationType: t.varchar({ length: 10 }).default("local"),
	managementKey: t.varchar({ length: 64 }).notNull(),
	createdAt: t.timestamp({ mode: "date" }).defaultNow(),
}));

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
