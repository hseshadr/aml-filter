import { mkdtemp, readFile } from "node:fs/promises";
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
		const root = await mkdtemp(join(tmpdir(), "snapshot-sources-"));
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
		const root = await mkdtemp(join(tmpdir(), "snapshot-sources-missing-"));
		const legacy: WatchlistSource = {
			id: "legacy",
			title: "legacy",
			fetchRaw: () => Promise.resolve({ "legacy.txt": "bytes" }),
			parse: () => [],
		};

		await expect(snapshotSources(root, [legacy])).rejects.toThrow(
			"legacy: source adapter cannot produce a provenance snapshot",
		);
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
		const root = await mkdtemp(join(tmpdir(), "snapshot-sources-real-"));

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
