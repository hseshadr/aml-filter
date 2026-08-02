import { describe, expect, it } from "vitest";
import { listAge } from "./listAge";

// A fixed "now" so every boundary is exact and nothing depends on the wall clock.
const NOW = new Date("2026-08-01T12:00:00Z");

/** An ISO instant `ms` milliseconds before NOW. */
function ago(ms: number): string {
	return new Date(NOW.getTime() - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("listAge — unit selection at the boundaries", () => {
	it("reports seconds under a minute", () => {
		expect(listAge(ago(12 * SECOND), NOW)).toMatchObject({
			value: 12,
			unit: "second",
		});
	});

	it("reports 'now' for an instant fetched this second", () => {
		expect(listAge(ago(0), NOW)?.phrase).toBe("now");
	});

	it("flips to minutes at exactly 60 seconds", () => {
		expect(listAge(ago(59 * SECOND), NOW)?.unit).toBe("second");
		expect(listAge(ago(MINUTE), NOW)).toMatchObject({
			value: 1,
			unit: "minute",
		});
	});

	it("flips to hours at exactly 60 minutes", () => {
		expect(listAge(ago(59 * MINUTE), NOW)?.unit).toBe("minute");
		expect(listAge(ago(HOUR), NOW)).toMatchObject({ value: 1, unit: "hour" });
	});

	it("flips to days at exactly 24 hours", () => {
		expect(listAge(ago(23 * HOUR), NOW)?.unit).toBe("hour");
		expect(listAge(ago(DAY), NOW)).toMatchObject({ value: 1, unit: "day" });
	});

	it("truncates rather than rounds (a 3-day-23-hour list is 3 days old)", () => {
		expect(listAge(ago(3 * DAY + 23 * HOUR), NOW)).toMatchObject({
			value: 3,
			unit: "day",
		});
	});

	it("clamps a future fetchedAt to zero rather than reporting a negative age", () => {
		const future = new Date(NOW.getTime() + DAY).toISOString();
		expect(listAge(future, NOW)).toMatchObject({ value: 0, unit: "second" });
	});
});

describe("listAge — human phrasing", () => {
	it("phrases hours as '4 hours ago'", () => {
		expect(listAge(ago(4 * HOUR), NOW)?.phrase).toBe("4 hours ago");
	});

	it("phrases a bare duration for the 'not updated for X' sentence", () => {
		expect(listAge(ago(3 * DAY), NOW)?.duration).toBe("3 days");
	});

	it("phrases a single day as a bare '1 day' duration", () => {
		expect(listAge(ago(DAY), NOW)?.duration).toBe("1 day");
	});

	it("phrases minutes as '5 minutes ago'", () => {
		expect(listAge(ago(5 * MINUTE), NOW)?.phrase).toBe("5 minutes ago");
	});
});

// A list whose age cannot be established must render as UNKNOWN, never as fresh.
// The engine's fail-closed guard should make these unreachable from a verified
// bundle; this is the second line of the same defence, at the render boundary.
describe("listAge — unusable input yields null, never a fabricated age", () => {
	it("returns null for null", () => {
		expect(listAge(null, NOW)).toBeNull();
	});

	it("returns null for undefined", () => {
		expect(listAge(undefined, NOW)).toBeNull();
	});

	it("returns null for an empty string", () => {
		expect(listAge("", NOW)).toBeNull();
	});

	it("returns null for an unparseable string", () => {
		expect(listAge("last Tuesday", NOW)).toBeNull();
	});

	it("returns null for a non-string", () => {
		expect(listAge(1_782_000_000_000 as unknown as string, NOW)).toBeNull();
	});
});
