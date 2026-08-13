import { describe, expect, it, vi } from "vitest";
import {
	openDurableCacheStore,
	requestPersistentStorage,
} from "./durableStore";
import { MemoryCacheStore } from "./memoryStore";

describe("openDurableCacheStore", () => {
	it("falls back when WebKit exposes OPFS but opening it throws", async () => {
		const opfsError = new DOMException(
			"The operation failed for an unknown transient reason (e.g. out of memory).",
			"UnknownError",
		);
		const fallback = new MemoryCacheStore();
		const openOpfs = vi.fn().mockRejectedValue(opfsError);
		const openFallback = vi.fn().mockResolvedValue(fallback);

		await expect(
			openDurableCacheStore({ openOpfs, openFallback }),
		).resolves.toBe(fallback);
		expect(openOpfs).toHaveBeenCalledOnce();
		expect(openFallback).toHaveBeenCalledOnce();
	});

	it("keeps OPFS preferred when it actually opens", async () => {
		const opfs = new MemoryCacheStore();
		const openFallback = vi.fn();

		await expect(
			openDurableCacheStore({
				openOpfs: () => Promise.resolve(opfs),
				openFallback,
			}),
		).resolves.toBe(opfs);
		expect(openFallback).not.toHaveBeenCalled();
	});

	it("preserves the OPFS failure when no durable fallback opens", async () => {
		const opfsError = new DOMException("OPFS unavailable", "UnknownError");

		await expect(
			openDurableCacheStore({
				openOpfs: () => Promise.reject(opfsError),
				openFallback: () => Promise.reject(new Error("IndexedDB unavailable")),
			}),
		).rejects.toThrow("OPFS unavailable");
	});
});

describe("requestPersistentStorage", () => {
	it("is a no-op when a WebKit Worker omits navigator.storage", () => {
		expect(() => requestPersistentStorage(undefined)).not.toThrow();
	});

	it("keeps a rejected best-effort persistence request non-blocking", async () => {
		const persist = vi.fn().mockRejectedValue(new Error("not supported"));
		requestPersistentStorage({ persist });
		await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
	});
});
