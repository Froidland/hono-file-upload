import { Hono } from "hono";
import { cors } from "hono/cors";
import upload from "./routes/upload.ts";
import files from "./routes/files.ts";
import { mkdir } from "node:fs/promises";
import { logger } from "hono/logger";
import type { Serve } from "bun";

await mkdir("./files").catch((err) => {
	if (err.code !== "EEXIST") {
		console.error(err);
		process.exit(1);
	}
});

const app = new Hono();

// Middleware
app.use(cors());
app.use(logger());

// Routes
app.route("/upload", upload);
app.route("/files", files);

export default {
	fetch: app.fetch,
	port: process.env.PORT || 3000,
	idleTimeout: 30,
} satisfies Serve;
