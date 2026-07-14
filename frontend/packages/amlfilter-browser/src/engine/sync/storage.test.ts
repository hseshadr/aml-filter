import { describe, expect, it } from "vitest";
import { fitsInQuota, isQuotaExceeded, QuotaError } from "./storage";

describe("fitsInQuota", () => {
	it("fits when free space (quota - usage) covers the needed bytes", () => {
		expect(fitsInQuota({ quota: 1000, usage: 200 }, 500)).toBe(true);
	});

	it("exactly fits when free space equals the needed bytes", () => {
		expect(fitsInQuota({ quota: 1000, usage: 500 }, 500)).toBe(true);
	});

	it("does not fit when free space is short of the needed bytes", () => {
		expect(fitsInQuota({ quota: 1000, usage: 900 }, 500)).toBe(false);
	});

	it("is best-effort: proceeds when the browser can't report a quota", () => {
		expect(fitsInQuota({ usage: 900 }, 500)).toBe(true);
	});

	it("is best-effort: proceeds when the browser can't report usage", () => {
		expect(fitsInQuota({ quota: 1000 }, 500)).toBe(true);
	});

	it("is best-effort: proceeds when the estimate is entirely empty", () => {
		expect(fitsInQuota({}, 500)).toBe(true);
	});
});

describe("isQuotaExceeded", () => {
	it("recognizes the modern QuotaExceededError DOMException", () => {
		expect(
			isQuotaExceeded(new DOMException("full", "QuotaExceededError")),
		).toBe(true);
	});

	it("recognizes the legacy Firefox NS_ERROR_DOM_QUOTA_REACHED name", () => {
		expect(
			isQuotaExceeded(new DOMException("full", "NS_ERROR_DOM_QUOTA_REACHED")),
		).toBe(true);
	});

	it("is false for an unrelated DOMException", () => {
		expect(isQuotaExceeded(new DOMException("nope", "NotFoundError"))).toBe(
			false,
		);
	});

	it("is false for a plain Error or non-error value", () => {
		expect(isQuotaExceeded(new Error("boom"))).toBe(false);
		expect(isQuotaExceeded("boom")).toBe(false);
	});
});

describe("QuotaError", () => {
	it("is an Error named QuotaError", () => {
		const error = new QuotaError("out of room");
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("QuotaError");
		expect(error.message).toBe("out of room");
	});
});
