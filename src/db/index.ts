import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
const connectionUrl = process.env.DB_URL;

if (!connectionUrl) {
	throw new Error("DB_URL must be provided");
}

export const db = drizzle({
	connection: { url: connectionUrl },
	schema,
	casing: "snake_case",
});
