import type { ScreenResponse } from "@amlfilter/browser";
import type { WorkstationStore } from "@amlfilter/workstation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	resetWorkstationForTests,
	type WorkstationDeps,
	workstation,
} from "./workstation";

function makeStore(): WorkstationStore {
	return {
		open: vi.fn().mockResolvedValue(1),
		createCustomer: vi.fn(),
		listCustomers: vi.fn(),
		getCustomer: vi.fn(),
		updateCustomer: vi.fn(),
		deleteCustomer: vi.fn(),
		recordMatches: vi.fn(),
		listReviewMatches: vi.fn(),
		resolveMatch: vi.fn(),
		getSetting: vi.fn(),
		setSetting: vi.fn(),
	} as unknown as WorkstationStore;
}

function makeDeps(store: WorkstationStore): WorkstationDeps {
	const response: ScreenResponse = {
		request_id: "r",
		matches: [],
		list_versions_used: {},
		execution_time_ms: 1,
	};
	return {
		spawnStore: vi.fn(() => store),
		runtime: {
			bootstrap: vi.fn().mockResolvedValue({
				screen: vi.fn().mockResolvedValue(response),
			}),
		},
	};
}

beforeEach(() => {
	resetWorkstationForTests();
});

describe("workstation boot", () => {
	it("opens the DB once and memoizes the handle", async () => {
		const store = makeStore();
		const deps = makeDeps(store);
		const first = await workstation(deps);
		const second = await workstation(deps);
		expect(first).toBe(second);
		expect(store.open).toHaveBeenCalledTimes(1);
		expect(deps.spawnStore).toHaveBeenCalledTimes(1);
	});

	it("does NOT bootstrap the engine during boot (lazy — review board needs no model)", async () => {
		const deps = makeDeps(makeStore());
		await workstation(deps);
		expect(deps.runtime.bootstrap).not.toHaveBeenCalled();
	});

	it("engineBoot and the screener share the memoized runtime bootstrap", async () => {
		const deps = makeDeps(makeStore());
		const handle = await workstation(deps);
		await handle.engineBoot();
		expect(deps.runtime.bootstrap).toHaveBeenCalledTimes(1);
	});

	it("a failed DB open clears the memo so the next call retries", async () => {
		const store = makeStore();
		vi.mocked(store.open)
			.mockRejectedValueOnce(new Error("locked by another tab"))
			.mockResolvedValueOnce(1);
		const deps = makeDeps(store);
		await expect(workstation(deps)).rejects.toThrow(/locked/);
		await expect(workstation(deps)).resolves.toBeDefined();
		expect(store.open).toHaveBeenCalledTimes(2);
	});
});
