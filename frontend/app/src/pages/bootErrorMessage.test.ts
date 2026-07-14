import { describe, expect, it } from "vitest";
import { bootErrorMessage, deviceUnsupportedMessage } from "./bootErrorMessage";

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
