import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { stream } from "hono/streaming";
import { mkdir, open, stat } from "fs/promises";
import type { IncomingMessage } from "http";
import { randomBytes } from "crypto";

await mkdir("./uploads", { recursive: true }).catch((err) => {
	console.error(err);
});

const apiKey = process.env.API_KEY;

const app = new Hono();

app.use(
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
	})
);

app.use(async (c, next) => {
	console.log(c.req.method, c.req.url);
	return await next();
});

app.post("/upload", async (c) => {
	const request = c.req.raw;

	if (apiKey) {
		const authorization = request.headers.get("authorization");

		if (!authorization || authorization !== `Bearer ${apiKey}`) {
			return c.json(
				{
					error: "unauthorized",
					message:
						"you must send authentication credentials through the authorization header",
				},
				401
			);
		}
	}

	const body = request.body;

	if (!body) {
		return c.json({ error: "a request body must be provided" }, 400);
	}

	const contentLength = Number(request.headers.get("content-length"));
	if (!contentLength) {
		return c.json({ error: "content-length must be provided" }, 400);
	}

	const contentType = request.headers.get("content-type");
	if (!contentType || !contentType.startsWith("application/octet-stream")) {
		return c.json({ error: "content-type must be a stream" }, 400);
	}

	if (contentLength > 1024 * 1024 * 10000) {
		return c.json({ error: "file size must be less than 10MB" }, 400);
	}

	const id = randomBytes(16).toString("hex");
	const file = await open(`./uploads/${id}`, "w+");

	const reader = body.getReader();

	await new Promise<void>(async (resolve, reject) => {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				resolve();
				break;
			}

			file.write(value);
		}
	});

	file.close();
	return c.json({ id }, 201);
});

app.get("/:id", async (c) => {
	const id = c.req.param("id");

	if (!id) {
		return c.json({ error: "param 'id' must be provided" }, 400);
	}

	try {
		await stat(`./uploads/${id}`);
	} catch {
		return c.json({ error: "file not found" }, 404);
	}

	const file = await open(`./uploads/${id}`);
	const reader = file.createReadStream();

	return stream(c, async (stream) => {
		stream.onAbort(() => {
			file.close();
		});

		await new Promise<void>((resolve, reject) => {
			reader.on("readable", () => {
				const chunk = reader.read();
				if (chunk) {
					stream.write(chunk);
				} else {
					resolve();
				}
			});

			reader.on("error", async (err) => {
				console.error(err);
				reader.close();
				await file.close();
				reject();
			});
		});

		reader.close();
		await file.close();
	});
});

console.log("Listening on port", process.env.PORT || 3000);
serve({
	fetch: app.fetch,
	port: Number(process.env.PORT) || 3000,
	serverOptions: {
		requestTimeout: 10000,
	},
});
