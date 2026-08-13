import { describe, expect, it } from "vitest";
import {
	type CapabilityScope,
	DeviceUnsupportedError,
	detectCapabilities,
	engineSupport,
	isEngineSupported,
	missingCapabilities,
} from "./deviceSupport";

// A scope where every engine capability is present (a modern browser). Note the
// engine's Worker-only createSyncAccessHandle is intentionally NOT probed here —
// it is [Exposed=DedicatedWorker] and cannot be seen from the main thread, so the
// detector relies on OPFS getDirectory as the main-thread-safe proxy.
const FULL: CapabilityScope = {
	Worker: function Worker() {},
	indexedDB: { open: () => {} },
	navigator: {
		storage: { getDirectory: () => {} },
		locks: { request: () => {} },
	},
};

describe("detectCapabilities", () => {
	it("reports every capability present for a modern browser scope", () => {
		expect(detectCapabilities(FULL)).toEqual({
			moduleWorker: true,
			durableStorage: true,
			webLocks: true,
		});
	});

	it("reports Web Workers absent when there is no Worker constructor", () => {
		const caps = detectCapabilities({ ...FULL, Worker: undefined });
		expect(caps.moduleWorker).toBe(false);
	});

	it("accepts IndexedDB when OPFS is missing", () => {
		const caps = detectCapabilities({ ...FULL, navigator: { storage: {} } });
		expect(caps.durableStorage).toBe(true);
	});

	it("reports durable storage absent when both OPFS and IndexedDB are missing", () => {
		const caps = detectCapabilities({
			...FULL,
			indexedDB: undefined,
			navigator: undefined,
		});
		expect(caps.durableStorage).toBe(false);
	});

	it("reports Web Locks absent when cross-tab mutation serialization is unavailable", () => {
		const caps = detectCapabilities({
			...FULL,
			navigator: { storage: { getDirectory: () => {} } },
		});
		expect(caps.webLocks).toBe(false);
	});
});

describe("missingCapabilities + isEngineSupported", () => {
	it("returns an empty list and supported=true when all are present", () => {
		const caps = detectCapabilities(FULL);
		expect(missingCapabilities(caps)).toEqual([]);
		expect(isEngineSupported(caps)).toBe(true);
	});

	it("names each missing capability in a human-readable form", () => {
		const caps = detectCapabilities({
			Worker: undefined,
			navigator: undefined,
		});
		const missing = missingCapabilities(caps);
		expect(missing.length).toBe(3);
		expect(missing.join(" ")).toMatch(/worker/i);
		expect(missing.join(" ")).toMatch(/opfs|storage/i);
		expect(missing.join(" ")).toMatch(/lock/i);
		expect(isEngineSupported(caps)).toBe(false);
	});
});

describe("engineSupport", () => {
	it("summarizes a full scope as supported with no missing capabilities", () => {
		expect(engineSupport(FULL)).toEqual({ supported: true, missing: [] });
	});

	it("summarizes a bare scope as unsupported with the missing list", () => {
		const support = engineSupport({});
		expect(support.supported).toBe(false);
		expect(support.missing.length).toBeGreaterThan(0);
	});
});

describe("DeviceUnsupportedError", () => {
	it("carries the missing list and names them in the message", () => {
		const error = new DeviceUnsupportedError(["Web Workers", "OPFS"]);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("DeviceUnsupportedError");
		expect(error.missing).toEqual(["Web Workers", "OPFS"]);
		expect(error.message).toMatch(/Web Workers/);
	});
});
