import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomBytes } from "node:crypto";

const app = new Hono();

app.use(
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
	})
);

app.post("/upload", async (c) => {
	const body = await c.req.formData();

	const data = body.get("file");

	if (!data) {
		return c.json({ error: "you must provide a file" }, 400);
	}

	if (!(data instanceof File)) {
		return c.json({ error: "'file' must be binary data" }, 400);
	}

	const contentType = c.req.header("Content-Type");
	const contentLength = c.req.header("Content-Length");
	if (!Number(contentLength)) {
		return c.json({ error: "invalid content-length header" }, 400);
	}

	if (Number(contentLength) > 1024 * 1024 * 1000) {
		return c.json({ error: "file size must not exceed 10MB" }, 400);
	}

	if (!contentType || !contentType.includes("multipart/form-data")) {
		return c.json(
			{
				error: "invalid content-type header, it must be multipart/form-data",
			},
			400
		);
	}

	const id = randomBytes(16).toString("hex");

	try {
		const file = await Deno.create(`./uploads/${id}`);
		const stream = data.stream();
		const reader = stream.getReader();
		const writer = file.writable.getWriter();

		await writer.ready;

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			await writer.write(value);
		}
	} catch (err) {
		console.error(err);
		await Deno.remove(`./uploads/${id}`).catch(console.error);
		return c.json({ error: "unexpected error" }, 500);
	}

	return c.json({ id }, 201);
});

app.get("/:id", async (c) => {
	const id = c.req.param("id");

	if (!id) {
		return c.json({ error: "param 'id' must be provided" }, 400);
	}

	try {
		await Deno.stat(`./uploads/${id}`);
	} catch {
		return c.json({ error: "file not found" }, 404);
	}

	const file = await Deno.open(`./uploads/${id}`);

	return c.body(file.readable, 200);
});

Deno.serve({ port: Number(Deno.env.get("PORT")) || 8000 }, app.fetch);
