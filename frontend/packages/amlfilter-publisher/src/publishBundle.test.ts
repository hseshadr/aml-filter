// edgeprocPublishArgs builds the exact `uv run --project <edge-proc> edgeproc
// publish ...` argv. Pure + unit-testable so the invocation contract is pinned
// without shelling out (the actual child_process run is a LOCAL-only build step).

import { describe, expect, test } from "vitest";
import { edgeprocPublishArgs } from "./publishBundle.ts";

describe("edgeprocPublishArgs", () => {
	test("builds the uv --project edgeproc publish invocation", () => {
		const { command, args } = edgeprocPublishArgs({
			srcDir: "/abs/staging",
			originDir: "/abs/origin",
			keyPath: "/abs/demo.key",
			bundleId: "amlfilter-watchlists",
			version: "demo-1",
			edgeprocDir: "/abs/edge-proc",
		});
		expect(command).toBe("uv");
		expect(args).toEqual([
			"run",
			"--project",
			"/abs/edge-proc",
			"edgeproc",
			"publish",
			"--src",
			"/abs/staging",
			"--origin-dir",
			"/abs/origin",
			"--key",
			"/abs/demo.key",
			"--bundle-id",
			"amlfilter-watchlists",
			"--version",
			"demo-1",
			"--pretty",
		]);
	});

	test("uses the default edge-proc dir when none is given", () => {
		const { args } = edgeprocPublishArgs({
			srcDir: "/s",
			originDir: "/o",
			keyPath: "/k",
			bundleId: "b",
			version: "v",
		});
		expect(args[2]).toBe("/Users/harish/dev/oss/edge-proc");
	});
});
