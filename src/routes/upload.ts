import { Hono } from "hono";
import {
	MultipartParseError,
	parseMultipartRequest,
} from "@mjackson/multipart-parser";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { HTTPException } from "hono/http-exception";
import { files, type File, type NewFile } from "../db/schema";
import { db } from "../db";
import { rm } from "node:fs/promises";

const API_KEY = process.env.API_KEY;
const FILE_DIRECTORY_PATH = path.resolve("./files");
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 1024 * 1024 * 10);

const app = new Hono();

async function handleMultipartRequest(request: Request, maxFileSize?: number) {
	const writtenFiles = new Array<NewFile>();
	const dbFiles = new Array<Omit<File, "location" | "locationType">>();
	let incompleteFilePath: string | null = null;

	try {
		for await (const part of parseMultipartRequest(request, {
			maxFileSize: maxFileSize || 1024 * 1024 * 10, // default to 10MB
		})) {
			if (!part.filename || !part.isFile) {
				continue;
			}

			const parsedName = path.parse(part.filename);

			const id = randomBytes(16).toString("hex");
			const filePath = `${FILE_DIRECTORY_PATH}/${id}`;
			const managementKey = randomBytes(32).toString("hex");
			const file = Bun.file(filePath);
			incompleteFilePath = filePath;

			const writer = file.writer();

			// @ts-expect-error bun-types ReadableStream does not have a Symbol.asyncIterator but does implement it
			for await (const chunk of part.body) {
				writer.write(chunk);
			}
			await writer.end();

			writtenFiles.push({
				id,
				name: parsedName.name,
				encodedName: encodeURIComponent(parsedName.name),
				extension: parsedName.ext,
				size: file.size,
				location: filePath,
				managementKey,
			});
			incompleteFilePath = null;
		}

		const rows = await db.insert(files).values(writtenFiles).returning({
			id: files.id,
			name: files.name,
			encodedName: files.encodedName,
			extension: files.extension,
			size: files.size,
			managementKey: files.managementKey,
			createdAt: files.createdAt,
		});

		dbFiles.push(...rows);
	} catch (err) {
		if (incompleteFilePath) {
			rm(incompleteFilePath).catch((err) => {
				console.error(err);
			});
		}

		for (const file of writtenFiles) {
			rm(file.location).catch((err) => {
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

	if (writtenFiles.length === 0) {
		throw new HTTPException(400, {
			message: "no files were uploaded",
			cause: "no valid files were found in the form data body",
		});
	}

	return dbFiles;
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
