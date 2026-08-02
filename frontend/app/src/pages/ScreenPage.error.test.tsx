import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Adversarial guard for the silent false-clear on the screen path. A mid-session
// engine.screen() rejection must surface a VISIBLE error state — never leave a
// stale/empty result reading as "no sanctions match", which would clear a name
// the engine never actually screened. See ScreenPage.runSearch's try/catch.

const clearEntity = {
	entity_id: "DEMO:CLEAR",
	entity_type: "PERSON",
	primary_name: "Olga Notrealova",
	name_canonical: "olga notrealova",
	aliases: [] as ReadonlyArray<{ name: string }>,
	dob: [] as string[],
	countries: [] as string[],
	nationalities: [] as string[],
	addresses: [] as string[],
	identifiers: { passport: [], national_id: [], other: {} },
	risk_category: "SANCTION",
	source_list: "DEMO_SDN",
	list_version: "demo-v1",
};

// The engine: a "clear" query resolves with ZERO matches (a genuine no-hit); the
// "ivan" query REJECTS mid-session (a crashed worker / model fault). Before the
// fix the rejection is swallowed and the prior clear result lingers, so the
// sanctioned "ivan" wrongly reads as cleared.
vi.mock("@amlfilter/browser", async (importActual) => {
	const actual = await importActual<typeof import("@amlfilter/browser")>();
	class EngineRuntime {
		// The real runtime always exposes this, and /screen reads it to state the
		// age of the list it screens against. A mock without it would leave the page
		// permanently reporting "age unknown".
		catalogLists() {
			return Promise.resolve([
				{
					id: "OFAC_SDN",
					title: "OFAC SDN",
					version: "demo-1",
					entitiesCount: 1,
					fetchedAt: "2026-08-01T08:00:00Z",
					sourceUpdatedAt: null,
					stale: false,
					staleReason: null,
				},
			]);
		}
		bootstrap(): Promise<void> {
			return Promise.resolve();
		}
		engine() {
			return {
				allEntities: () => [clearEntity],
				screen: ({ name }: { name: string }) => {
					if (name.toLowerCase().includes("ivan")) {
						return Promise.reject(new Error("screen worker crashed"));
					}
					return Promise.resolve({
						request_id: "clear",
						list_versions_used: {},
						execution_time_ms: 3,
						matches: [],
					});
				},
			};
		}
		dispose(): Promise<void> {
			// The page disposes its page-owned runtime on real unmount (deferred one
			// macrotask); a resolved no-op keeps that teardown inert here.
			return Promise.resolve();
		}
	}
	return {
		...actual,
		EngineRuntime,
		configFromEnv: () => ({}),
		// jsdom lacks Worker/OPFS; force "supported" so boot reaches the ready box.
		engineSupport: () => ({ supported: true, missing: [] }),
	};
});

import { ScreenPage } from "./ScreenPage";

afterEach(() => {
	cleanup();
});

async function readyBox(): Promise<HTMLInputElement> {
	return (await waitFor(() => {
		const el = screen.getByPlaceholderText(/Search a name/);
		expect((el as HTMLInputElement).disabled).toBe(false);
		return el;
	})) as HTMLInputElement;
}

describe("ScreenPage — screen rejection must not read as a clear", () => {
	it("surfaces an error state on a mid-session screen rejection, not an empty no-match", async () => {
		render(<ScreenPage />);
		const box = await readyBox();

		// First, a genuine clear: the box shows the no-match line.
		fireEvent.change(box, { target: { value: "harmless" } });
		await waitFor(() =>
			expect(screen.getByText(/No sanctions match/)).toBeTruthy(),
		);

		// Now a query the engine REJECTS mid-session. The stale clear must NOT
		// remain, and the name must NOT read as "no sanctions match".
		fireEvent.change(box, { target: { value: "ivan" } });

		await waitFor(() => {
			const alert = screen.getByRole("alert");
			expect(alert.textContent ?? "").toMatch(/not.*cleared|screening failed/i);
		});
		// The false-clear must be gone: an unscreened name is never a cleared name.
		expect(screen.queryByText(/No sanctions match/)).toBeNull();
	});

	it("recovers to a normal result when a later search succeeds after an error", async () => {
		render(<ScreenPage />);
		const box = await readyBox();

		fireEvent.change(box, { target: { value: "ivan" } });
		await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

		// A subsequent screenable query clears the error banner.
		fireEvent.change(box, { target: { value: "harmless" } });
		await waitFor(() =>
			expect(screen.getByText(/No sanctions match/)).toBeTruthy(),
		);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
