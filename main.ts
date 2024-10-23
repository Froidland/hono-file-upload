import { Hono } from "@hono/hono";
import { getConnInfo } from "@hono/hono/deno";
import { stream } from "@hono/hono/streaming";
import { randomBytes } from "node:crypto";

await Deno.mkdir("./uploads", { recursive: true }).catch((err) => {
	if (err.code !== "EEXIST") {
		console.error(err);
		Deno.exit(1);
	}
});

const apiKey = Deno.env.get("API_KEY");

const app = new Hono();

app.use("/upload", async (c, next) => {
	await next();
	const connInfo = getConnInfo(c);
	console.log(
		`${c.res.status} ${c.req.method} ${c.req.path} | ${connInfo.remote.address}:${connInfo.remote.port}`
	);
});

app.post("/upload", async (c) => {
	c.header("Access-Control-Allow-Origin", "*");
	c.header("Access-Control-Allow-Methods", "POST, OPTIONS");

	if (apiKey) {
		const authorization = c.req.header("authorization");
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

	const rawRequest = c.req.raw;
	const body = rawRequest.body;

	if (!body) {
		return c.json({ error: "a request body must be provided" }, 400);
	}

	const contentLength = Number(rawRequest.headers.get("content-length"));
	if (!contentLength) {
		return c.json({ error: "content-length must be provided" }, 400);
	}

	const contentType = rawRequest.headers.get("content-type");
	if (!contentType || !contentType.startsWith("application/octet-stream")) {
		return c.json({ error: "content-type must be a stream" }, 400);
	}

	if (contentLength > 1024 * 1024 * 10000) {
		return c.json({ error: "file size must be less than 10MB" }, 400);
	}

	const id = randomBytes(16).toString("hex");
	const file = await Deno.create(`./uploads/${id}`);

	const reader = body.getReader();
	const writer = file.writable.getWriter();

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			await writer.close();
			break;
		}

		await writer.write(value);
	}

	return c.json({ id }, 201);
});

app.get("/:id", async (c) => {
	c.header("Access-Control-Allow-Origin", "*");
	c.header("Access-Control-Allow-Methods", "GET, OPTIONS");

	const id = c.req.param("id");

	if (!id) {
		return c.json({ error: "param 'id' must be provided" }, 400);
	}

	try {
		await Deno.stat(`./uploads/${id}`);
	} catch {
		return c.json({ error: "file not found" }, 404);
	}

	const file = await Deno.open(`./uploads/${id}`, { read: true });
	const reader = file.readable.getReader();

	return stream(c, async (stream) => {
		stream.onAbort(() => {
			file.close();
		});

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			stream.write(value);
		}

		file.close();
	});
});

Deno.serve({ port: Number(Deno.env.get("PORT")) || 3000 }, app.fetch);
