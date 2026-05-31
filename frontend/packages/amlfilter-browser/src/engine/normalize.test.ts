import { describe, expect, it } from "vitest";
import { canonicalize } from "./normalize";

// Parity with aml_filter.domain.normalization.normalize_name's canonical form.
describe("canonicalize mirrors the backend name pipeline", () => {
	it("lowercases and collapses whitespace", () => {
		expect(canonicalize("  Vladimir   Ivanov ")).toBe("vladimir ivanov");
	});

	it("strips titles", () => {
		expect(canonicalize("Dr Boris Petrov")).toBe("boris petrov");
		expect(canonicalize("Mr. John Smith")).toBe("john smith");
	});

	it("drops punctuation but keeps hyphens", () => {
		expect(canonicalize("Jean-Luc, Picard!")).toBe("jean-luc picard");
	});

	it("returns empty for blank input", () => {
		expect(canonicalize("   ")).toBe("");
		expect(canonicalize("")).toBe("");
	});

	it("strips combining accents via NFKD (parity with Python re \\w)", () => {
		// NFKD decomposes é -> e + U+0301; the combining mark is category Mn, which
		// neither \p{L}/\p{N} (here) nor Python's \w keeps, so both yield "jose".
		expect(canonicalize("José")).toBe("jose");
	});
});
