import { describe, expect, it } from "vitest";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
	it("uses KB below a megabyte so an early download never reads '0 MB'", () => {
		expect(formatBytes(0)).toBe("0 KB");
		expect(formatBytes(37_000)).toBe("37 KB");
		expect(formatBytes(999_000)).toBe("999 KB");
	});

	it("keeps one decimal below 10 MB, where it still carries information", () => {
		expect(formatBytes(1_450_000)).toBe("1.4 MB");
		expect(formatBytes(5_242_880)).toBe("5.2 MB");
	});

	it("drops the decimal above 10 MB, where it is noise", () => {
		expect(formatBytes(12_000_000)).toBe("12 MB");
		expect(formatBytes(22_972_370)).toBe("23 MB");
	});

	it("is decimal MB, not MiB — one unit across every surface", () => {
		// 10^6, not 2^20. Were this MiB, 5_242_880 would render "5.0 MB" here and
		// "5.2 MB" wherever decimal was used, for the very same download.
		expect(formatBytes(1_000_000)).toBe("1.0 MB");
		expect(formatBytes(5_242_880)).not.toBe("5.0 MB");
	});
});
