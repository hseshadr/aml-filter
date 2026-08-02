// The sync engine's Worker entry. It owns the OPFS store (sync access handles
// are Worker-only) and the engine; the main thread drives it over postMessage.
// One concern: route a request to the engine, reply with a typed envelope.

/// <reference lib="webworker" />

import { verifyEd25519 } from "../crypto";
import { toErrorResponse } from "./errorEnvelope";
import { fetchBytes } from "./fetchBytes";
import {
	type WebLockManager,
	withClearLifecycleLock,
	withPromotionLock,
	withSyncLifecycleLock,
} from "./mutationLock";
import { OpfsCacheStore } from "./opfsStore";
import type {
	ClearRequest,
	EngineRequest,
	EngineResponse,
	ReadFileRequest,
	SyncRequest,
} from "./protocol";
import { materializeFile, syncIndex } from "./sync";
import { transferables } from "./transfer";
import type { IndexManifest, VersionPointer } from "./types";

const DECODER = new TextDecoder();

let storePromise: Promise<OpfsCacheStore> | null = null;
let activeManifest: IndexManifest | null = null;

function store(): Promise<OpfsCacheStore> {
	if (storePromise === null) {
		storePromise = OpfsCacheStore.open();
	}
	return storePromise;
}

function lockManager(): WebLockManager | undefined {
	return navigator.locks as unknown as WebLockManager | undefined;
}

async function loadPubkey(pubkeyUrl: string): Promise<Uint8Array> {
	// The pinned trust root is the one input the whole fail-closed verify hangs
	// on; fetch it fresh (no-store) so a stale cached key can never be the thing
	// that's verified against. Same-origin, so the cost is negligible.
	return fetchBytes(pubkeyUrl, { cache: "no-store" });
}

async function handleSync(req: SyncRequest): Promise<EngineResponse> {
	return withSyncLifecycleLock(lockManager(), async () => {
		void navigator.storage.persist?.().catch(() => false); // best-effort, never blocks
		const cacheStore = await store();
		const pubkey = await loadPubkey(req.pubkeyUrl);
		const result = await syncIndex({
			baseUrl: req.baseUrl,
			// Scope the sync to the selected lists. Narrows WHAT is fetched only —
			// signature, content-address, anti-rollback and the reused-chunk
			// verification all still run over exactly what this sync claims.
			wantedPaths: req.wantedPaths,
			store: cacheStore,
			fetchBytes,
			verify: (message, signature) => verifyEd25519(pubkey, message, signature),
			// Storage-quota preflight seam: refuse fail-fast with a QuotaError if the
			// device can't hold the bundle, instead of fetching tens of MB only for the
			// first OPFS write to throw. Guarded — a browser without estimate() reports
			// nothing, which the preflight treats best-effort (proceed).
			estimateStorage: () =>
				navigator.storage?.estimate?.() ?? Promise.resolve({}),
			// One-way per-chunk progress back to the main thread so the boot banner
			// shows n/total during the long cold sync instead of looking frozen.
			onProgress: (progress) => {
				self.postMessage({ kind: "sync-progress", id: req.id, progress });
			},
			// The lock is held only for the final active-pointer re-read + write;
			// downloads and verification remain concurrent across tabs.
			promoteExclusive: (operation) =>
				withPromotionLock(lockManager(), operation),
		});
		const raw = await cacheStore.getManifest(result.manifestHash);
		activeManifest = JSON.parse(DECODER.decode(raw)) as IndexManifest;
		return { ok: true, id: req.id, kind: "sync", result };
	});
}

async function handleReadFile(req: ReadFileRequest): Promise<EngineResponse> {
	const manifest = activeManifest ?? (await loadActiveManifest());
	const bytes = await materializeFile(await store(), manifest, req.path);
	return { ok: true, id: req.id, kind: "readFile", bytes };
}

async function handleClear(req: ClearRequest): Promise<EngineResponse> {
	return withClearLifecycleLock(lockManager(), async () => {
		await (await store()).clear();
		// The cleared store has no active manifest; force a re-read on the next sync.
		activeManifest = null;
		return { ok: true, id: req.id, kind: "clear" };
	});
}

async function loadActiveManifest(): Promise<IndexManifest> {
	const cacheStore = await store();
	const active: VersionPointer | null = await cacheStore.readActive();
	if (active === null) {
		throw new Error("no active version — sync first");
	}
	const raw = await cacheStore.getManifest(active.manifest_hash);
	const manifest = JSON.parse(DECODER.decode(raw)) as IndexManifest;
	activeManifest = manifest;
	return manifest;
}

async function handle(req: EngineRequest): Promise<EngineResponse> {
	switch (req.kind) {
		case "sync":
			return handleSync(req);
		case "readFile":
			return handleReadFile(req);
		case "clear":
			return handleClear(req);
	}
}

self.addEventListener("message", (event: MessageEvent<EngineRequest>) => {
	const req = event.data;
	handle(req)
		.then((response) => {
			// Transfer the readFile bytes (see transferables): hand the buffer to the
			// main thread zero-copy instead of structured-cloning it, so a multi-MB
			// materialized file never exists twice at once at peak.
			self.postMessage(response, transferables(response));
		})
		.catch((error: unknown) => {
			// Carry the error's TYPE, not just its text: postMessage structured-clones
			// the payload and drops prototypes, so `.name` has to travel as data or
			// every type-based branch on the main thread is dead. See errorEnvelope.ts.
			self.postMessage(toErrorResponse(req.id, error));
		});
});
