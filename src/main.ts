import { Hono } from "hono";
import { cors } from "hono/cors";
import upload from "./routes/upload.ts";
import files from "./routes/files.ts";
import { mkdir } from "node:fs/promises";
import type { Serve } from "bun";
import { getAddressFromContext } from "./utils.ts";
import { HTTPException } from "hono/http-exception";

const FILE_DIRECTORY = process.env.FILE_DIRECTORY || "./files";

await mkdir(FILE_DIRECTORY).catch((err) => {
	if (err.code !== "EEXIST") {
		console.error(err);
		process.exit(1);
	}
});

const app = new Hono();

// Middleware
app.use(cors());
app.use(async (c, next) => {
	await next();

	console.log(
		`[${new Date().toISOString()}] ${c.res.status} ${c.req.method} ${c.req.path} | ${getAddressFromContext(c)}`,
	);
});

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json(
			{ message: err.message, cause: err.cause || "unknown" },
			err.status,
		);
	}

	return c.body(err.message, 500);
});

// Routes
app.route("/upload", upload);
app.route("/files", files);

export default {
	fetch: app.fetch,
	port: process.env.PORT || 3000,
	idleTimeout: 30,
	maxRequestBodySize:
		Number(process.env.MAX_REQUEST_BODY_SIZE) || 1024 * 1024 * 128,
} satisfies Serve;
