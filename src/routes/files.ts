import { Hono } from "hono";
import { stream } from "hono/streaming";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { files } from "../db/schema";
import { HTTPException } from "hono/http-exception";
import { rm } from "node:fs/promises";

const app = new Hono();

app.get("/:id", async (c) => {
	const id = c.req.param("id");

	const dbFile = await db.query.files.findFirst({
		where: eq(files.id, id),
	});

	if (!dbFile) {
		throw new HTTPException(404, {
			message: `file with id '${id}' does not exist`,
			cause: "file not found",
		});
	}

	if (dbFile.locationType !== "local") {
		throw new HTTPException(501, {
			message: "unable to retrieve non-local file",
			cause: "non-local files are not implemented yet",
		});
	}

	const file = Bun.file(dbFile.location);

	if (!file.exists()) {
		throw new HTTPException(500, {
			message: "failed to retrieve file from filesystem",
			cause: "file not found in files directory",
		});
	}

	c.header("Content-Length", dbFile.size.toString());
	c.header(
		"Content-Disposition",
		`inline; filename=${dbFile.name}${dbFile.extension || ""}; filename*=UTF-8''${dbFile.encodedName}${dbFile.extension || ""}; size=${dbFile.size}`,
	);

	const fileStream = file.stream();

	return stream(c, async (stream) => {
		stream.onAbort(async () => {
			await fileStream.cancel("abort");
		});

		// @ts-expect-error bun-types ReadableStream does not have a Symbol.asyncIterator but does implement it
		for await (const chunk of fileStream) {
			await stream.write(chunk);
		}
	});
});

app.get("/:id/download", async (c) => {
	const id = c.req.param("id");

	const dbFile = await db.query.files.findFirst({
		where: eq(files.id, id),
	});

	if (!dbFile) {
		throw new HTTPException(404, {
			message: `file with id '${id}' does not exist`,
			cause: "file not found",
		});
	}

	if (dbFile.locationType !== "local") {
		throw new HTTPException(501, {
			message: "unable to download non-local file",
			cause: "non-local files are not implemented yet",
		});
	}

	const file = Bun.file(dbFile.location);

	if (!(await file.exists())) {
		throw new HTTPException(500, {
			message: "failed to retrieve file from filesystem",
			cause: "file not found in files directory",
		});
	}

	c.header("Content-Length", dbFile.size.toString());
	c.header(
		"Content-Disposition",
		`attachment; filename=${dbFile.name}${dbFile.extension || ""}; filename*=UTF-8''${dbFile.encodedName}${dbFile.extension || ""}; size=${dbFile.size}`,
	);

	const reader = file.stream().getReader();

	return stream(c, async (stream) => {
		stream.onAbort(() => {
			reader.cancel("abort");
		});

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			stream.write(value);
		}
	});
});

app.delete("/:id", async (c) => {
	const id = c.req.param("id");
	const managementKey = c.req.query("managementKey");

	if (!managementKey) {
		throw new HTTPException(400, {
			cause: "query param 'managementKey' must be provided to delete files",
		});
	}

	const dbFile = await db.query.files.findFirst({
		where: eq(files.id, id),
	});

	if (!dbFile) {
		throw new HTTPException(404, {
			message: `file with id '${id}' does not exist`,
			cause: "file not found",
		});
	}

	if (dbFile.managementKey !== managementKey) {
		throw new HTTPException(403, { cause: "invalid management key" });
	}

	if (dbFile.locationType !== "local") {
		throw new HTTPException(501, {
			message: "unable to delete non-local file",
			cause: "non-local files are not implemented yet",
		});
	}

	const file = Bun.file(dbFile.location);

	if (!(await file.exists())) {
		throw new HTTPException(500, {
			message: "failed to retrieve file from filesystem",
			cause: "file not found in files directory",
		});
	}

	await rm(dbFile.location);
	await db.delete(files).where(eq(files.id, id));

	return c.body(null, 204);
});

app.get("/:id/info", async (c) => {
	const id = c.req.param("id");

	const dbFile = await db.query.files.findFirst({
		where: eq(files.id, id),
		columns: {
			id: true,
			name: true,
			encodedName: true,
			extension: true,
			size: true,
			createdAt: true,
		},
	});

	if (!dbFile) {
		throw new HTTPException(404, { cause: "file not found" });
	}

	return c.json(dbFile);
});

export default app;
