import {
	canonicalBytes,
	classifyEngineError,
	decompressAndVerify,
	EngineClient,
	EngineOperationError,
	fetchBytes,
	IntegrityError,
	MemoryCacheStore,
	materializeFile,
	NetworkError,
	OpfsCacheStore,
	ResponseTooLargeError,
	RollbackError,
	SignatureError,
	SyncCapError,
	sha256Hex,
	syncIndex,
	verifyEd25519,
	verifyPlaintext,
} from "@edgeproc/browser";
import {
	assertVectorIndexConformance,
	FlatVectorIndex,
	PackedVectorIndex,
} from "@edgeproc/browser/vector";
import { describe, expect, it } from "vitest";
import workspaceText from "../../../../pnpm-workspace.yaml?raw";
import packageJsonText from "../../package.json?raw";

const EDGE_PROC_BROWSER_REVISION =
	"github:hseshadr/edgeproc-browser#f1ae371c8dfe441c6a3dd845e92c3d67adf654bd";
const PUBLIC_IMPORTS = ["@edgeproc/browser", "@edgeproc/browser/vector"];

describe("@edgeproc/browser consumer dependency", () => {
	it("pins the standalone package to the reviewed public commit", () => {
		const manifest = JSON.parse(packageJsonText) as {
			dependencies?: Record<string, string>;
		};

		expect(manifest.dependencies?.["@edgeproc/browser"]).toBe(
			EDGE_PROC_BROWSER_REVISION,
		);
		expect(workspaceText).not.toContain('"@edgeproc/browser": "link:');
	});

	it("resolves both public entrypoints from the installed standalone package", () => {
		for (const packageImport of PUBLIC_IMPORTS) {
			const resolved = import.meta.resolve(packageImport);
			expect(resolved).toContain("/node_modules/@edgeproc/browser/dist/");
			expect(resolved).not.toContain("/oss/edgeproc-browser/dist/");
			expect(resolved).not.toContain("/amlfilter-browser/src/");
		}
	});

	it("provides signed-bundle primitives from the public root only", () => {
		expect([
			canonicalBytes,
			classifyEngineError,
			EngineClient,
			EngineOperationError,
			MemoryCacheStore,
			OpfsCacheStore,
			decompressAndVerify,
			fetchBytes,
			materializeFile,
			sha256Hex,
			syncIndex,
			verifyEd25519,
			verifyPlaintext,
		]).not.toContain(undefined);
		expect([
			IntegrityError,
			NetworkError,
			ResponseTooLargeError,
			RollbackError,
			SignatureError,
			SyncCapError,
		]).toEqual([
			expect.any(Function),
			expect.any(Function),
			expect.any(Function),
			expect.any(Function),
			expect.any(Function),
			expect.any(Function),
		]);
	});

	it("provides vector primitives only through the public vector subpath", () => {
		expect(FlatVectorIndex).toEqual(expect.any(Function));
		expect(PackedVectorIndex).toEqual(expect.any(Function));
		expect(assertVectorIndexConformance).toEqual(expect.any(Function));
	});
});
