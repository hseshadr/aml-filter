import { describe, expect, it } from "vitest";

const copiedRuntimeModules = import.meta.glob(
	[
		"./canonical.ts",
		"./crypto.ts",
		"./types.ts",
		"./sync/{client,durableStore,fetchBytes,memoryStore,mutationLock,opfsStore,protocol,sync,transfer,types,worker}.ts",
	],
	{ eager: true, query: "?raw", import: "default" },
);

describe("shared edge-processing runtime boundary", () => {
	it("contains no copied production Worker, sync, transport, crypto, or canonical implementation", () => {
		expect(Object.keys(copiedRuntimeModules)).toEqual([]);
	});

	it("contains no copied production storage implementation", () => {
		const copiedStorage = import.meta.glob(
			["./sync/*.ts", "!./sync/*.test.ts"],
			{ eager: true, query: "?raw", import: "default" },
		);
		expect(Object.keys(copiedStorage)).toEqual([]);
	});
});
