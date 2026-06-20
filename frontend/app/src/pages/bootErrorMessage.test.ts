import { describe, expect, it } from "vitest";
import { bootErrorMessage } from "./bootErrorMessage";

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
