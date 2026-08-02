// What a Worker-origin failure actually renders.
//
// `bootErrorMessage.test.ts` hands `new IntegrityError(...)` straight to the
// registry. That proves the registry branches correctly — but every engine
// failure a real visitor can hit is thrown INSIDE the sync Worker and crosses
// `postMessage` first. Structured clone drops prototypes, so the object the
// registry sees in production is not the object the registry sees in that test.
//
// The gap was not theoretical. A live fail-closed `SignatureError` reached the
// UI as a plain `Error` and rendered:
//
//     "Local screening engine unavailable — Close another AML-Filter tab."
//
// The product's core security claim, reported as a tab conflict.
//
// This file asserts the rendered copy for errors that have crossed the real
// boundary. PROVEN ABLE TO FAIL: drop `errorName` from the envelope (or have the
// client rebuild with a bare `new Error(message)`) and every case below collapses
// to the "Local screening engine unavailable" fallback.

import {
	fromErrorResponse,
	IntegrityError,
	SignatureError,
	toErrorResponse,
} from "@amlfilter/browser/engine";
import { describe, expect, it } from "vitest";
import { classifyBundleError, userFacingBootError } from "./bootErrorMessage";

/**
 * Put a thrown value through the exact trip a Worker failure makes: the Worker's
 * envelope, a real `structuredClone` (what `postMessage` applies), then the
 * client's rehydration. The result is what the UI's error path receives.
 */
function acrossTheWorkerBoundary(thrown: unknown): Error {
	return fromErrorResponse(structuredClone(toErrorResponse(1, thrown)));
}

describe("boot error copy for Worker-origin failures", () => {
	it("renders the signature failure as a verification failure, not a tab conflict", () => {
		const caught = acrossTheWorkerBoundary(
			new SignatureError("signature verification failed"),
		);

		expect(classifyBundleError(caught)).toBe("integrity_failed");
		expect(userFacingBootError(caught)).toMatchObject({
			title: "Screening list verification failed",
		});
		// The exact wrong string this defect produced, pinned so a regression is
		// named rather than merely a diff.
		expect(userFacingBootError(caught).title).not.toBe(
			"Local screening engine unavailable",
		);
	});

	it("renders a content-address failure as a verification failure", () => {
		const caught = acrossTheWorkerBoundary(
			new IntegrityError("chunk 9ca6 failed its content-address check"),
		);

		expect(classifyBundleError(caught)).toBe("integrity_failed");
		expect(userFacingBootError(caught).title).toBe(
			"Screening list verification failed",
		);
	});

	it("still renders the storage-full copy for a quota refusal", () => {
		// QuotaError is defined in the sync tier; the registry matches it by name,
		// which is exactly what the envelope now carries.
		const quota = new Error("not enough room for the bundle");
		quota.name = "QuotaError";
		const caught = acrossTheWorkerBoundary(quota);

		expect(userFacingBootError(caught).title).toBe("Device storage is full");
	});

	it("renders every fail-closed verification verdict the same way", () => {
		// One case per member of VERIFICATION_FAILURES. Each of these means "these
		// bytes could not be trusted"; none of them is a tab conflict.
		const verdicts = [
			"SignatureError",
			"IntegrityError",
			"RollbackError",
			"DecompressionLimitError",
			"UndeclaredSizeError",
			"FetchLimitError",
		];

		for (const name of verdicts) {
			const thrown = new Error(`${name} fired`);
			thrown.name = name;
			const caught = acrossTheWorkerBoundary(thrown);

			expect({ name, kind: classifyBundleError(caught) }).toEqual({
				name,
				kind: "integrity_failed",
			});
		}
	});

	it("keeps the engine-unavailable fallback REACHABLE for an unclassified failure", () => {
		// Widening the verification family must not swallow the fallback. A failure
		// no branch claims still has to land on `internal.unknown` — otherwise this
		// fix would have traded one always-wrong answer for another.
		const caught = acrossTheWorkerBoundary(
			new Error("engine worker terminated"),
		);

		expect(classifyBundleError(caught)).toBe("unknown");
		expect(userFacingBootError(caught)).toMatchObject({
			title: "Local screening engine unavailable",
			recovery: "Close another AML-Filter tab, then retry.",
		});
	});
});
