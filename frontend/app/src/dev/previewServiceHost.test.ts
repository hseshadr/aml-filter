// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type PreviewServer, preview } from "vite";
import { afterEach, describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "../..");
let server: PreviewServer | undefined;
let dist: string | undefined;

function requestStatus(port: number): Promise<number | undefined> {
	return new Promise((resolveStatus, reject) => {
		const req = request(
			{
				host: "127.0.0.1",
				port,
				path: "/build.json",
				headers: { Host: "preview:4173" },
			},
			(response) => {
				response.resume();
				resolveStatus(response.statusCode);
			},
		);
		req.on("error", reject);
		req.end();
	});
}

afterEach(async () => {
	server?.httpServer.close();
	if (dist !== undefined) await rm(dist, { recursive: true, force: true });
});

describe("Dagger preview service", () => {
	it("serves build identity through the bound service hostname", async () => {
		dist = await mkdtemp(join(tmpdir(), "aml-filter-preview-"));
		await writeFile(join(dist, "build.json"), '{"git_sha":"test"}\n');
		server = await preview({
			root: appRoot,
			build: { outDir: dist },
			preview: { host: true, port: 0 },
		});
		const address = server.httpServer.address() as AddressInfo;

		expect(await requestStatus(address.port)).toBe(200);
	});
});
