import { DeviceUnsupportedError, QuotaError } from "@amlfilter/browser";
import { IntegrityError } from "@amlfilter/browser/engine";
import { starterPack } from "@edgeproc/errors";
import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import {
	type BundleErrorKind,
	bootErrorMessage,
	bundleErrorRegistry,
	classifyBundleError,
	deviceUnsupportedMessage,
} from "./bootErrorMessage";

/** A raw failure carrying a specific `.name` (e.g. the transport `NetworkError`),
 * without importing every internal error class — classification is duck-typed on
 * `.name`, exactly like the app's own typed-error guards. */
function named(name: string, message: string): Error {
	const error = new Error(message);
	error.name = name;
	return error;
}

describe("bootErrorMessage", () => {
	it("surfaces the underlying fail-closed cause", () => {
		const msg = bootErrorMessage(new Error("signature verification failed"));
		expect(msg).toBe(
			"Could not load the screening bundle: signature verification failed",
		);
	});

	it("keeps the substring the C1 alert assertion matches", () => {
		const msg = bootErrorMessage(new Error("boom"));
		expect(msg.toLowerCase()).toContain("could not load the screening bundle");
	});

	it("coerces a non-Error rejection to a string detail", () => {
		const msg = bootErrorMessage("raw string failure");
		expect(msg).toBe("Could not load the screening bundle: raw string failure");
	});
});

describe("deviceUnsupportedMessage", () => {
	it("tells the visitor to use a recent desktop browser", () => {
		const msg = deviceUnsupportedMessage([]);
		expect(msg.toLowerCase()).toContain("can’t run the local engine");
		expect(msg.toLowerCase()).toContain("desktop browser");
	});

	it("names the missing capabilities when any are supplied", () => {
		const msg = deviceUnsupportedMessage(["Web Workers", "OPFS"]);
		expect(msg).toContain("Web Workers");
		expect(msg).toContain("OPFS");
	});

	it("omits the missing-features clause when none are named", () => {
		const msg = deviceUnsupportedMessage([]);
		expect(msg.toLowerCase()).not.toContain("missing:");
	});
});

describe("@edgeproc/errors adoption (canonical-errors standard)", () => {
	// The bundle-load error path now classifies raw boot failures through the
	// VENDORED @edgeproc/errors registry (packages/edgeproc-errors) instead of an
	// ad-hoc if-chain. These tests prove two things: (1) the vendored library is
	// really what does the work — `bundleErrorRegistry` is a genuine
	// @edgeproc/errors Registry built from its `starterPack` codes; and (2) the
	// coded classification is BEHAVIOR-IDENTICAL — each failure still renders the
	// exact same existing `errors:*` string, so no user-visible copy or i18n key
	// moved.

	it("exposes a genuine @edgeproc/errors Registry built from the vendored starterPack", () => {
		for (const method of [
			"has",
			"get",
			"classify",
			"describe",
			"toProblemDetails",
			"create",
		] as const) {
			expect(typeof bundleErrorRegistry[method]).toBe("function");
		}
		// The bundle codes are REUSED from the library's starterPack, not
		// re-declared: the registered entry carries the starter data verbatim.
		expect(bundleErrorRegistry.get("bundle.quota_exceeded")?.category).toBe(
			starterPack["bundle.quota_exceeded"].category,
		);
		expect(bundleErrorRegistry.get("net.unreachable")?.category).toBe(
			starterPack["net.unreachable"].category,
		);
		expect(bundleErrorRegistry.codes).toContain("internal.unknown");
	});

	it("classifies each typed boot failure into its canonical starterPack code", () => {
		expect(
			bundleErrorRegistry.classify(new DeviceUnsupportedError(["Web Workers"])),
		).toBe("bundle.device_unsupported");
		expect(bundleErrorRegistry.classify(new QuotaError("no room"))).toBe(
			"bundle.quota_exceeded",
		);
		expect(
			bundleErrorRegistry.classify(
				new IntegrityError("chunk abc failed content-address check"),
			),
		).toBe("bundle.integrity_failed");
		expect(
			bundleErrorRegistry.classify(
				named("AbortError", "the operation was aborted"),
			),
		).toBe("bundle.timeout");
		expect(
			bundleErrorRegistry.classify(
				named("NetworkError", "fetch /x failed: timed out after 15000ms"),
			),
		).toBe("bundle.timeout");
		expect(
			bundleErrorRegistry.classify(
				named("NetworkError", "fetch /x failed: network unreachable"),
			),
		).toBe("net.unreachable");
		expect(
			bundleErrorRegistry.classify(
				named("NetworkError", "fetch /x failed: 404 Not Found"),
			),
		).toBe("bundle.download_failed");
		expect(
			bundleErrorRegistry.classify(new Error("signature verification failed")),
		).toBe("internal.unknown");
	});

	it("maps each canonical code to the public BundleErrorKind", () => {
		const cases: ReadonlyArray<readonly [unknown, BundleErrorKind]> = [
			[new DeviceUnsupportedError([]), "device_unsupported"],
			[new QuotaError("no room"), "quota_exceeded"],
			[
				new IntegrityError("chunk abc failed content-address check"),
				"integrity_failed",
			],
			[named("TimeoutError", "timed out"), "timeout"],
			[
				named("NetworkError", "fetch /x failed: network unreachable"),
				"network",
			],
			[
				named("NetworkError", "fetch /x failed: 500 Server Error"),
				"download_failed",
			],
			[new Error("signature verification failed"), "unknown"],
		];
		for (const [raw, kind] of cases) {
			expect(classifyBundleError(raw)).toBe(kind);
		}
	});

	it("renders the SAME 'could not load' wrapper for every retryable boot cause (behavior-identical)", () => {
		// Quota, integrity, and transport failures all still surface through the one
		// wrapper — the specific cause rides in {detail}, exactly as before the
		// registry was introduced.
		expect(bootErrorMessage(new QuotaError("Not enough free storage"))).toBe(
			"Could not load the screening bundle: Not enough free storage",
		);
		expect(
			bootErrorMessage(
				new IntegrityError("chunk abc failed content-address check"),
			),
		).toBe(
			"Could not load the screening bundle: chunk abc failed content-address check",
		);
		expect(
			bootErrorMessage(
				named("NetworkError", "fetch /x failed: timed out after 15000ms"),
			),
		).toBe(
			"Could not load the screening bundle: fetch /x failed: timed out after 15000ms",
		);
	});

	it("routes a device-capability failure to the unsupported-device copy, not the wrapper", () => {
		const typed = new DeviceUnsupportedError(["Web Workers"]);
		expect(bootErrorMessage(typed)).toBe(
			deviceUnsupportedMessage(["Web Workers"]),
		);
		expect(bootErrorMessage(typed)).not.toContain("Could not load");
		// A duck-typed device failure (name set, not a real instance) still routes to
		// the dead-end copy, with no missing-capability clause it can't read.
		expect(bootErrorMessage(named("DeviceUnsupportedError", "x"))).toBe(
			deviceUnsupportedMessage([]),
		);
	});

	it("resolves the unsupported-device base copy through the registry's describe()", () => {
		// The base sentence is the app's existing errors:device.unsupported string,
		// now rendered via the vendored registry (bundle.device_unsupported) — same
		// bytes, so behavior is identical.
		expect(deviceUnsupportedMessage([])).toBe(
			i18n.t("errors:device.unsupported"),
		);
		expect(
			bundleErrorRegistry.describe(
				"bundle.device_unsupported",
				{},
				(key, params) => i18n.t(key, params ?? {}),
			),
		).toBe(i18n.t("errors:device.unsupported"));
	});

	it("serializes a canonical code to an RFC 9457 Problem Details shape", () => {
		const problem = bundleErrorRegistry.toProblemDetails(
			"bundle.quota_exceeded",
			{
				requiredBytes: 10,
				availableBytes: 2,
			},
		);
		expect(problem.type).toBe("bundle.quota_exceeded");
		expect(typeof problem.title).toBe("string");
		expect(problem.requiredBytes).toBe(10);
		expect(problem.availableBytes).toBe(2);
	});
});
