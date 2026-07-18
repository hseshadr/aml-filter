// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cspFromHeadersFile } from "./previewHeaders";

const headersPath = resolve(import.meta.dirname, "../../public/_headers");

describe("preview production headers", () => {
	it("extracts the catch-all CSP from the real Pages headers file", () => {
		const csp = cspFromHeadersFile(readFileSync(headersPath, "utf8"));
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("connect-src 'self'");
		expect(csp).not.toContain("\n");
	});

	it("fails closed when the catch-all block has no CSP", () => {
		expect(() => cspFromHeadersFile("/*\n  X-Frame-Options: DENY\n")).toThrow(
			/Content-Security-Policy/,
		);
	});
});
