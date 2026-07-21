// ENGINE_VERSION is stamped into every signed score receipt, so it must track
// the package it describes. This guard fails CI on a release bump that forgets
// the constant — otherwise receipts would attest a version that never shipped.

/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compositeVersion, ENGINE_VERSION } from "./version";

const HERE = dirname(fileURLToPath(import.meta.url));
// src/engine -> src -> amlfilter-browser
const PACKAGE_JSON = join(HERE, "..", "..", "package.json");

describe("ENGINE_VERSION", () => {
	it("matches the package version it stamps into receipts", () => {
		const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8")) as {
			version: string;
		};
		expect(ENGINE_VERSION).toBe(pkg.version);
	});
});

describe("compositeVersion", () => {
	it("sorts by list id so map insertion order cannot churn the stamp", () => {
		expect(compositeVersion({ b: "v2", a: "v1" })).toBe("a@v1|b@v2");
		expect(compositeVersion({ a: "v1", b: "v2" })).toBe("a@v1|b@v2");
	});

	it("renders a single list and an empty selection", () => {
		expect(compositeVersion({ ofac: "2026.06.09" })).toBe("ofac@2026.06.09");
		expect(compositeVersion({})).toBe("");
	});
});
