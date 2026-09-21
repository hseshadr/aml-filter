import {
	classifyEngineError,
	EngineOperationError,
	IntegrityError,
	NetworkError,
	RollbackError,
	SignatureError,
} from "@amlfilter/browser/engine";
import { describe, expect, it } from "vitest";
import { classifyBundleError, userFacingBootError } from "./bootErrorMessage";

function acrossTheWorkerBoundary(thrown: unknown): EngineOperationError {
	return new EngineOperationError(structuredClone(classifyEngineError(thrown)));
}

describe("boot error copy for shared Worker failures", () => {
	it.each([
		new SignatureError("signature verification failed"),
		new IntegrityError("chunk failed content-address verification"),
		new RollbackError("signed pointer moved backwards"),
	])("renders %s as a verification failure", (thrown) => {
		const caught = acrossTheWorkerBoundary(thrown);

		expect(classifyBundleError(caught)).toBe("integrity_failed");
		expect(userFacingBootError(caught).title).toBe(
			"Screening list verification failed",
		);
	});

	it("renders a storage refusal as device storage full", () => {
		const caught = acrossTheWorkerBoundary(
			new Error("browser storage quota refused the write"),
		);

		expect(classifyBundleError(caught)).toBe("quota_exceeded");
		expect(userFacingBootError(caught).title).toBe("Device storage is full");
	});

	it("renders OPFS mutation-lock contention as another-tab recovery", () => {
		const caught = acrossTheWorkerBoundary(
			new Error("timed out acquiring OPFS mutation lock"),
		);

		expect(caught.code).toBe("lock");
		expect(classifyBundleError(caught)).toBe("lock");
		expect(userFacingBootError(caught)).toMatchObject({
			title: "Local screening engine unavailable",
			recovery: "Close another AML-Filter tab, then retry.",
		});
	});

	it("retains transport classification after structured clone", () => {
		const caught = acrossTheWorkerBoundary(
			new NetworkError("fetch /x failed: network unreachable"),
		);

		expect(classifyBundleError(caught)).toBe("network");
		expect(userFacingBootError(caught).title).toBe(
			"Screening list could not be loaded",
		);
	});

	it("keeps the engine-unavailable fallback reachable", () => {
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
