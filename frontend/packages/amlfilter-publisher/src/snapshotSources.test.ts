import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotSources } from "./snapshotSources.ts";
import type {
	RawListBytes,
	SourceSnapshot,
	WatchlistSource,
} from "./sources/source.ts";

function source(id: string, snapshot: SourceSnapshot): WatchlistSource {
	return {
		id,
		title: id,
		fetchRaw: () => Promise.resolve(snapshot.raw),
		fetchSnapshot: () => Promise.resolve(snapshot),
		parse: () => {
			throw new Error("snapshot must not parse or build a watchlist");
		},
	};
}

function captured(
	raw: RawListBytes,
	finalUrl: string,
	lastModified: string,
): SourceSnapshot {
	return {
		raw,
		transport: { finalUrl, etag: '"fixture-v1"', lastModified },
		sourceUpdatedAt: "2026-08-23T00:00:00.000Z",
	};
}

describe("snapshotSources", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("writes sorted canonical bytes and provenance without building or signing", async () => {
		const parent = await mkdtemp(join(tmpdir(), "snapshot-sources-"));
		const root = join(parent, "snapshot");
		const manifest = await snapshotSources(root, [
			source(
				"zeta",
				captured(
					{ "b.txt": "beta", "a.txt": "alpha" },
					"https://feeds.example/zeta-final",
					"Sat, 23 Aug 2026 00:00:00 GMT",
				),
			),
			source(
				"alpha",
				captured(
					{ "one.csv": "first" },
					"https://feeds.example/alpha",
					"Sun, 24 Aug 2026 00:00:00 GMT",
				),
			),
		]);

		expect(manifest.sources.map((entry) => entry.id)).toEqual([
			"alpha",
			"zeta",
		]);
		expect(manifest.sources[1]?.files).toEqual([
			{
				path: "a.txt",
				bytes: 5,
				sha256:
					"8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8",
			},
			{
				path: "b.txt",
				bytes: 4,
				sha256:
					"f44e64e75f3948e9f73f8dfa94721c4ce8cbb4f265c4790c702b2d41cfbf2753",
			},
		]);
		expect(manifest.sources[1]?.finalUrl).toBe(
			"https://feeds.example/zeta-final",
		);
		expect(await readFile(join(root, "zeta", "a.txt"), "utf8")).toBe("alpha");
		expect(
			JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
		).toEqual(manifest);
	});

	it("fails closed when an adapter cannot provide transport provenance", async () => {
		const parent = await mkdtemp(join(tmpdir(), "snapshot-sources-missing-"));
		const root = join(parent, "snapshot");
		const legacy: WatchlistSource = {
			id: "legacy",
			title: "legacy",
			fetchRaw: () => Promise.resolve({ "legacy.txt": "bytes" }),
			parse: () => [],
		};

		await expect(snapshotSources(root, [legacy])).rejects.toThrow(
			"legacy: source adapter cannot produce a provenance snapshot",
		);
		expect(await readdir(parent)).toEqual([]);
	});

	it("rejects invalid provenance before exposing any canonical output", async () => {
		const parent = await mkdtemp(join(tmpdir(), "snapshot-invalid-date-"));
		const root = join(parent, "snapshot");
		const invalid = captured(
			{ "source.txt": "canonical bytes" },
			"https://feeds.example/source",
			"Sat, 23 Aug 2026 00:00:00 GMT",
		);
		const badSnapshot = { ...invalid, sourceUpdatedAt: "not-a-date" };

		await expect(
			snapshotSources(root, [source("bad", badSnapshot)]),
		).rejects.toThrow(/bad.*freshness timestamp.*invalid/i);
		expect(await readdir(parent)).toEqual([]);
	});

	it("rejects impossible ISO calendar dates instead of normalizing them", async () => {
		const parent = await mkdtemp(join(tmpdir(), "snapshot-impossible-date-"));
		const root = join(parent, "snapshot");
		const impossible = {
			...captured(
				{ "source.txt": "canonical bytes" },
				"https://feeds.example/source",
				"Sat, 23 Aug 2026 00:00:00 GMT",
			),
			sourceUpdatedAt: "2026-02-31T00:00:00Z",
		};

		await expect(
			snapshotSources(root, [source("bad-calendar", impossible)]),
		).rejects.toThrow(/bad-calendar.*freshness timestamp.*invalid/i);
		expect(await readdir(parent)).toEqual([]);
	});

	it("claims a cooperative exclusive lock before fetching sources", async () => {
		const parent = await mkdtemp(join(tmpdir(), "snapshot-lock-"));
		const root = join(parent, "snapshot");
		const guarded: WatchlistSource = {
			...source(
				"guarded",
				captured(
					{ "source.txt": "canonical bytes" },
					"https://feeds.example/source",
					"Sat, 23 Aug 2026 00:00:00 GMT",
				),
			),
			async fetchSnapshot() {
				expect(await readdir(parent)).toContain(".snapshot.lock");
				return captured(
					{ "source.txt": "canonical bytes" },
					"https://feeds.example/source",
					"Sat, 23 Aug 2026 00:00:00 GMT",
				);
			},
		};

		await snapshotSources(root, [guarded]);
		expect(await readdir(parent)).toEqual(["snapshot"]);
	});

	it("cleans concurrent partial work and permits a residue-free retry", async () => {
		const parent = await mkdtemp(join(tmpdir(), "snapshot-atomic-"));
		const root = join(parent, "snapshot");
		let fail = true;
		const delayed: WatchlistSource = {
			...source(
				"delayed",
				captured(
					{ "delayed.txt": "complete" },
					"https://feeds.example/delayed",
					"Sat, 23 Aug 2026 00:00:00 GMT",
				),
			),
			async fetchSnapshot() {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return captured(
					{ "delayed.txt": "complete" },
					"https://feeds.example/delayed",
					"Sat, 23 Aug 2026 00:00:00 GMT",
				);
			},
		};
		const flaky: WatchlistSource = {
			...delayed,
			id: "flaky",
			async fetchSnapshot() {
				await new Promise((resolve) => setTimeout(resolve, 5));
				if (fail) {
					throw new Error("source stream failed midway");
				}
				return captured(
					{ "flaky.txt": "complete" },
					"https://feeds.example/flaky",
					"Sat, 23 Aug 2026 00:00:00 GMT",
				);
			},
		};

		await expect(snapshotSources(root, [delayed, flaky])).rejects.toThrow(
			"source stream failed midway",
		);
		expect(await readdir(parent)).toEqual([]);

		fail = false;
		await expect(
			snapshotSources(root, [delayed, flaky]),
		).resolves.toMatchObject({
			sources: [{ id: "delayed" }, { id: "flaky" }],
		});
		expect((await readdir(parent)).sort()).toEqual(["snapshot"]);
	});

	it("rejects an existing final target without changing it", async () => {
		const parent = await mkdtemp(join(tmpdir(), "snapshot-existing-"));
		const root = join(parent, "snapshot");
		await writeFile(root, "do not replace", "utf8");

		await expect(snapshotSources(root, [])).rejects.toThrow(/already exists/i);
		expect(await readFile(root, "utf8")).toBe("do not replace");
	});

	it("removes staged primary bytes when the alias snapshot stream fails", async () => {
		const parent = await mkdtemp(join(tmpdir(), "snapshot-alias-stream-"));
		const root = join(parent, "snapshot");
		vi.stubGlobal(
			"fetch",
			vi.fn((input: string | URL | Request) => {
				const url = String(input);
				const body = url.includes("opensanctions")
					? new ReadableStream<Uint8Array>({
							start(controller) {
								controller.enqueue(new TextEncoder().encode("<partial>"));
							},
							pull(controller) {
								controller.error(new Error("alias stream failed midway"));
							},
						})
					: url.includes("trade.gov")
						? "source,entity_number\n"
						: url.includes("webgate")
							? '<export generationDate="2026-08-23T00:00:00Z"></export>'
							: url.includes("scsanctions")
								? '<CONSOLIDATED_LIST dateGenerated="2026-08-23T00:00:00Z"></CONSOLIDATED_LIST>'
								: "Last Updated,23/08/2026\nGroup ID,Alias Type\n";
				return Promise.resolve(
					new Response(body, {
						headers: { "last-modified": "Sun, 23 Aug 2026 00:00:00 GMT" },
					}),
				);
			}),
		);

		await expect(snapshotSources(root)).rejects.toThrow(
			"alias stream failed midway",
		);
		expect(await readdir(parent)).toEqual([]);
	});

	it("captures the four production source adapters through their bounded fetch seam", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((input: string | URL | Request) => {
				const url = String(input);
				const body = url.includes("trade.gov")
					? "source,entity_number\n"
					: url.includes("opensanctions")
						? "<ReferenceValueSets></ReferenceValueSets>"
						: url.includes("webgate")
							? '<export generationDate="2026-08-23T00:00:00Z"></export>'
							: url.includes("scsanctions")
								? '<CONSOLIDATED_LIST dateGenerated="2026-08-23T00:00:00Z"></CONSOLIDATED_LIST>'
								: "Last Updated,23/08/2026\nGroup ID,Alias Type\n";
				const response = new Response(body, {
					headers: {
						etag: '"source-v1"',
						"last-modified": "Sun, 23 Aug 2026 00:00:00 GMT",
					},
				});
				Object.defineProperty(response, "url", { value: `${url}?final=1` });
				return Promise.resolve(response);
			}),
		);
		const parent = await mkdtemp(join(tmpdir(), "snapshot-sources-real-"));
		const root = join(parent, "snapshot");

		const manifest = await snapshotSources(root);

		expect(manifest.sources.map((entry) => entry.id)).toEqual([
			"EU_CONSOLIDATED",
			"OFAC_SDN",
			"OFAC_SDN_ALIASES",
			"UK_OFSI",
			"UN_CONSOLIDATED",
		]);
		expect(
			manifest.sources.every((entry) => entry.finalUrl.endsWith("?final=1")),
		).toBe(true);
		expect(
			manifest.sources.every((entry) => entry.etag === '"source-v1"'),
		).toBe(true);
	});
});
