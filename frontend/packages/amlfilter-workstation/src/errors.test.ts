import { describe, expect, it } from "vitest";
import {
	DuplicateReferenceError,
	decodeWorkerError,
	encodeWorkerError,
	InvalidResolutionError,
	NotFoundError,
} from "./errors";

describe("worker error codec", () => {
	it("round-trips each typed error through the wire encoding", () => {
		const cases: ReadonlyArray<[Error, string]> = [
			[
				new DuplicateReferenceError("customer_reference 'R1' already exists"),
				"DuplicateReferenceError",
			],
			[new NotFoundError("match m-1 not found"), "NotFoundError"],
			[
				new InvalidResolutionError("invalid resolution_status 'PENDING'"),
				"InvalidResolutionError",
			],
		];
		for (const [error, name] of cases) {
			const decoded = decodeWorkerError(encodeWorkerError(error));
			expect(decoded.name).toBe(name);
			expect(decoded.message).toBe(error.message);
		}
	});

	it("passes plain errors through as plain Error", () => {
		const decoded = decodeWorkerError(encodeWorkerError(new Error("boom")));
		expect(decoded.name).toBe("Error");
		expect(decoded.message).toBe("boom");
	});
});
