// publishBundle() wraps `spawn("uv", …)` in a promise: resolve on exit 0,
// reject on a non-zero exit, reject on a spawn error (e.g. uv not installed).
// The subprocess boundary is replaced with an EventEmitter fake so the exit
// semantics are pinned deterministically and offline — the argv contract itself
// is pure and pinned by the edgeprocPublishArgs tests (here + publishBundle.test.ts).

import { EventEmitter } from "node:events";
import { afterEach, describe, expect, test, vi } from "vitest";
import { edgeprocPublishArgs, publishBundle } from "./publishBundle.ts";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const INPUT = {
	srcDir: "/abs/staging",
	originDir: "/abs/origin",
	keyPath: "/abs/demo.key",
	bundleId: "amlfilter-watchlists",
	version: "demo-1",
	edgeprocDir: "/abs/edge-proc",
} as const;

/** A fake child process that emits `close` with `code` on the next microtask. */
function childExiting(code: number): EventEmitter {
	const child = new EventEmitter();
	queueMicrotask(() => child.emit("close", code));
	return child;
}

describe("publishBundle", () => {
	afterEach(() => {
		spawnMock.mockReset();
	});

	test("resolves on a zero exit and spawns the exact edgeproc argv", async () => {
		spawnMock.mockImplementation(() => childExiting(0));
		await expect(publishBundle(INPUT)).resolves.toBeUndefined();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		const [command, args, options] = spawnMock.mock.calls[0] ?? [];
		expect(command).toBe("uv");
		expect(args).toEqual([...edgeprocPublishArgs(INPUT).args]);
		expect(options).toEqual({ stdio: "inherit" });
	});

	test("rejects with the exit code on a non-zero exit", async () => {
		spawnMock.mockImplementation(() => childExiting(3));
		await expect(publishBundle(INPUT)).rejects.toThrow(
			"edgeproc publish exited with code 3",
		);
	});

	test("rejects when the spawn itself errors (uv missing)", async () => {
		spawnMock.mockImplementation(() => {
			const child = new EventEmitter();
			queueMicrotask(() => child.emit("error", new Error("spawn uv ENOENT")));
			return child;
		});
		await expect(publishBundle(INPUT)).rejects.toThrow("spawn uv ENOENT");
	});
});

describe("edgeprocPublishArgs env fallback", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("EDGEPROC_DIR is used when no explicit edgeprocDir is given", () => {
		vi.stubEnv("EDGEPROC_DIR", "/env/edge-proc");
		const { args } = edgeprocPublishArgs({
			srcDir: "/s",
			originDir: "/o",
			keyPath: "/k",
			bundleId: "b",
			version: "v",
		});
		expect(args[2]).toBe("/env/edge-proc");
	});
});
