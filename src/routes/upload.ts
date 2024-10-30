import { Hono } from "hono";
import {
	MultipartParseError,
	parseMultipartRequest,
} from "@mjackson/multipart-parser";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { HTTPException } from "hono/http-exception";
import { files, type File } from "../db/schema";
import { db } from "../db";
import { omit } from "es-toolkit";

const API_KEY = process.env.API_KEY;
const FILE_DIRECTORY = process.env.FILE_DIRECTORY || "./files";

const app = new Hono();

async function handleMultipartRequest(request: Request) {
	const results: Omit<File, "location" | "locationType">[] = [];

	try {
		for await (const part of parseMultipartRequest(request)) {
			if (!part.filename) {
				continue;
			}

			const nameInfo = path.parse(part.filename);
			const id = randomBytes(16).toString("hex");
			const managementKey = randomBytes(32).toString("hex");
			const file = Bun.file(`${FILE_DIRECTORY}/${id}`);

			const reader = part.body.getReader();
			const writer = file.writer();

			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					break;
				}

				writer.write(value);
			}

			await writer.end();
			const dbFile = await db
				.insert(files)
				.values({
					id,
					name: nameInfo.name,
					encodedName: encodeURIComponent(nameInfo.name),
					extension: nameInfo.ext,
					size: file.size,
					location: path.resolve(`${FILE_DIRECTORY}/${id}`),
					managementKey,
				})
				.returning();
			results.push(omit(dbFile[0], ["location", "locationType"]));
		}
	} catch (err) {
		if (err instanceof MultipartParseError) {
			throw new HTTPException(400, { cause: err });
		}

		console.error(err);
		throw new HTTPException(500, { cause: err });
	}

	if (results.length === 0) {
		throw new HTTPException(400, {
			message: "no files were uploaded",
		});
	}

	return results;
}

app.post("/", async (c) => {
	if (API_KEY) {
		const authorization = c.req.header("authorization");
		if (!authorization || authorization !== `Bearer ${API_KEY}`) {
			return c.json(
				{
					error: "unauthorized",
					message:
						"you must send authentication credentials through the authorization header",
				},
				401,
			);
		}
	}

	const contentType = c.req.header("Content-Type");
	if (!contentType || !contentType.startsWith("multipart/form-data")) {
		throw new HTTPException(400, {
			message: "content-type header must be multipart/form-data",
		});
	}

	const contentLength = c.req.header("Content-Length");
	if (!contentLength) {
		throw new HTTPException(411, {
			message:
				"content-length header must be provided and must be valid, otherwise the request will fail",
		});
	}

	if (Number(contentLength) > 1024 * 1024 * 10) {
		throw new HTTPException(413, {
			message: "request body must be less than 10MB",
		});
	}

	const files = await handleMultipartRequest(c.req.raw);

	return c.json({ files }, 201);
});

export default app;
