import { describe, expect, it } from "vitest";
import { bootErrorMessage } from "./bootErrorMessage";

describe("bootErrorMessage", () => {
	it("names the bundle origin so a port collision is diagnosable", () => {
		const msg = bootErrorMessage(
			"http://localhost:8081",
			new Error("signature verification failed"),
		);
		expect(msg).toBe(
			"Could not load the screening bundle from http://localhost:8081: signature verification failed",
		);
	});

	it("keeps the substring the C1 alert assertion matches", () => {
		const msg = bootErrorMessage("http://localhost:8081", new Error("boom"));
		expect(msg.toLowerCase()).toContain("could not load the screening bundle");
	});

	it("omits the origin clause when the origin is unset", () => {
		const msg = bootErrorMessage("", new Error("sync failed"));
		expect(msg).toBe("Could not load the screening bundle: sync failed");
	});

	it("coerces a non-Error rejection to a string detail", () => {
		const msg = bootErrorMessage("http://x", "raw string failure");
		expect(msg).toBe(
			"Could not load the screening bundle from http://x: raw string failure",
		);
	});
});
