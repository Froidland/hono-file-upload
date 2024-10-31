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
import { rm } from "node:fs/promises";

const API_KEY = process.env.API_KEY;
const FILE_DIRECTORY = process.env.FILE_DIRECTORY || "./files";
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 1024 * 1024 * 10);

const app = new Hono();

async function handleMultipartRequest(request: Request, maxFileSize?: number) {
	const results: Omit<File, "location" | "locationType">[] = [];

	let lastPath = "";
	try {
		for await (const part of parseMultipartRequest(request, {
			maxFileSize: maxFileSize || 1024 * 1024 * 10, // default to 10MB
		})) {
			if (!part.filename || !part.isFile) {
				continue;
			}

			const parsedName = path.parse(part.filename);

			const id = randomBytes(16).toString("hex");
			const managementKey = randomBytes(32).toString("hex");
			const file = Bun.file(`${FILE_DIRECTORY}/${id}`);
			lastPath = path.resolve(`${FILE_DIRECTORY}/${id}`);

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
					name: parsedName.name,
					encodedName: encodeURIComponent(parsedName.name),
					extension: parsedName.ext,
					size: file.size,
					location: path.resolve(`${FILE_DIRECTORY}/${id}`),
					managementKey,
				})
				.returning();
			results.push(omit(dbFile[0], ["location", "locationType"]));
		}
	} catch (err) {
		if (lastPath) {
			rm(lastPath).catch((err) => {
				console.error(err);
			});
		}

		if (err instanceof MultipartParseError) {
			throw new HTTPException(400, {
				message: err.message,
				cause: err.cause,
			});
		}

		throw new HTTPException(500, {
			message: "unexpected error while processing form data body",
			cause: "unknown",
		});
	}

	if (results.length === 0) {
		throw new HTTPException(400, {
			message: "no files were uploaded",
			cause: "no valid files were found in the form data body",
		});
	}

	return results;
}

app.post("/", async (c) => {
	if (API_KEY) {
		const authorization = c.req.header("authorization");
		if (!authorization || authorization !== `Bearer ${API_KEY}`) {
			throw new HTTPException(401, {
				message:
					"you must provide a valid API key in the 'Authorization' header as a Bearer token",
				cause: "invalid or missing API key",
			});
		}
	}

	const contentType = c.req.header("Content-Type");
	if (!contentType || !contentType.startsWith("multipart/form-data")) {
		throw new HTTPException(400, {
			message: "content-type header must be 'multipart/form-data'",
			cause: `invalid content-type header '${contentType || "[empty]"}'`,
		});
	}

	const contentLength = c.req.header("Content-Length");
	if (!contentLength) {
		throw new HTTPException(411, {
			message:
				"content-length header must be provided and must be valid, otherwise the request will fail",
			cause: "missing content-length header",
		});
	}

	const files = await handleMultipartRequest(c.req.raw, MAX_FILE_SIZE);

	return c.json({ files }, 201);
});

export default app;
