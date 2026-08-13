import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("i18n browser gate isolation", () => {
	it("asks the OS for a free preview port instead of colliding with another repo", async () => {
		const source = await readFile(
			join(process.cwd(), "scripts/verify-i18n.mjs"),
			"utf8",
		);
		expect(source).toContain("process.env.VERIFY_I18N_PORT ?? 0");
		expect(source).not.toContain("?? 4173");
	});
});
