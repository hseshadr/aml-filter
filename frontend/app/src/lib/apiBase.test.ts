import { describe, expect, it } from "vitest";
import { DEFAULT_API_BASE } from "./apiBase";

// The default backend origin must live in exactly ONE place. It used to be a
// literal duplicated in api.ts and vite.config.ts (drift hazard). This pins the
// single source of truth; both consumers import it.
describe("DEFAULT_API_BASE", () => {
	it("is the local backend origin", () => {
		expect(DEFAULT_API_BASE).toBe("http://localhost:8000");
	});
});
