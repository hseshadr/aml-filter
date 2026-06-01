import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mirror of ScreenPage's debounce window so the stale-result test can wait out
// the first query's debounce before issuing the second.
const DEBOUNCE_MS = 180;

// Minimal Entity/Match doubles — only the fields ScreenPage reads.
const ivanEntity = {
	entity_id: "DEMO:1",
	entity_type: "PERSON",
	primary_name: "Ivan Fakovich",
	name_canonical: "ivan fakovich",
	aliases: [
		{
			name: "Vanya Fakovich",
			name_canonical: "vanya fakovich",
			source: "DEMO",
		},
	],
	dob: ["1971-03-14"],
	countries: ["RU"],
	nationalities: ["RU"],
	addresses: ["123 Invented Prospekt"],
	identifiers: { passport: ["FAKE0001"], national_id: [], other: {} },
	risk_category: "SANCTION",
	source_list: "DEMO_SDN",
	list_version: "demo-v1",
};
const olgaEntity = {
	...ivanEntity,
	entity_id: "DEMO:2",
	primary_name: "Olga Notrealova",
};

const ivanMatch = {
	...ivanEntity,
	aliases: ["Vanya Fakovich"],
	score: 0.7,
	reasons: [
		{
			signal: "name_vector",
			value: 1,
			weight: 0.55,
			contribution: 0.55,
			description: "Vector similarity: 1.000",
		},
	],
	explanation: "Match due to: strong vector similarity",
};

// Two distinguishable matches for the stale-cancellation test. The "slow"
// query resolves LATER (longer delay) than the "fast" one, so if cancellation
// is broken the slow result would clobber the fast one.
const slowMatch = {
	...ivanMatch,
	entity_id: "DEMO:SLOW",
	primary_name: "Ivan Slowman",
};
const fastMatch = {
	...ivanMatch,
	entity_id: "DEMO:FAST",
	primary_name: "Ivan Fastman",
};

// The page builds its own EngineRuntime; mock the module so the test drives a
// deterministic engine with no Worker/bundle/model.
vi.mock("@amlfilter/browser", () => {
	class EngineRuntime {
		bootstrap(): Promise<void> {
			return Promise.resolve();
		}
		engine() {
			return {
				allEntities: () => [ivanEntity, olgaEntity],
				screen: ({ name }: { name: string }) => {
					const lower = name.toLowerCase();
					// Delay-aware branches drive the stale-result test: "slow"
					// resolves LATER than "fast" despite being issued FIRST.
					if (lower.includes("slow")) {
						return new Promise((resolve) =>
							setTimeout(
								() =>
									resolve({
										request_id: "slow",
										list_versions_used: {},
										execution_time_ms: 80,
										matches: [slowMatch],
									}),
								80,
							),
						);
					}
					if (lower.includes("fast")) {
						return new Promise((resolve) =>
							setTimeout(
								() =>
									resolve({
										request_id: "fast",
										list_versions_used: {},
										execution_time_ms: 5,
										matches: [fastMatch],
									}),
								5,
							),
						);
					}
					return Promise.resolve({
						request_id: "t",
						list_versions_used: {},
						execution_time_ms: 4,
						matches: lower.includes("ivan") ? [ivanMatch] : [],
					});
				},
			};
		}
	}
	return { EngineRuntime, configFromEnv: () => ({}) };
});

import { ScreenPage } from "./ScreenPage";

afterEach(cleanup);

describe("ScreenPage — in-browser search", () => {
	it("browses the whole list when the box is empty", async () => {
		render(<ScreenPage />);
		await waitFor(() =>
			expect(screen.getByText(/Browsing all 2 entities/)).toBeTruthy(),
		);
		// "Ivan Fakovich" is also an example chip — scope to the card name.
		expect(
			screen.getByText("Ivan Fakovich", { selector: ".match-card__name" }),
		).toBeTruthy();
		expect(screen.getByText("Olga Notrealova")).toBeTruthy();
	});

	it("shows a scored, explainable dossier for a matching query", async () => {
		render(<ScreenPage />);
		const box = await waitFor(() => {
			const el = screen.getByPlaceholderText(/Search a name/);
			expect((el as HTMLInputElement).disabled).toBe(false);
			return el;
		});
		fireEvent.change(box, { target: { value: "ivan" } });
		await waitFor(() =>
			expect(screen.getByText(/1 potential match/)).toBeTruthy(),
		);
		expect(screen.getByText("0.700")).toBeTruthy();
		expect(screen.getByText("123 Invented Prospekt")).toBeTruthy();
		expect(screen.getByText("Why this score?")).toBeTruthy();
	});

	it("shows a clean no-match for an unrelated query", async () => {
		render(<ScreenPage />);
		const box = await waitFor(() => {
			const el = screen.getByPlaceholderText(/Search a name/);
			expect((el as HTMLInputElement).disabled).toBe(false);
			return el;
		});
		fireEvent.change(box, { target: { value: "zxqw" } });
		await waitFor(() =>
			expect(screen.getByText(/No sanctions match/)).toBeTruthy(),
		);
	});

	it("renders only the latest query's result when an earlier search resolves later", async () => {
		render(<ScreenPage />);
		const box = await waitFor(() => {
			const el = screen.getByPlaceholderText(/Search a name/);
			expect((el as HTMLInputElement).disabled).toBe(false);
			return el;
		});
		// Issue the SLOW query first (resolves after ~80ms), wait for its
		// debounced search to actually fire, then issue the FAST query (resolves
		// after ~5ms). The fast result must win and the slow result, arriving
		// later, must NOT overwrite it — the seq-ref cancellation contract.
		fireEvent.change(box, { target: { value: "ivan slow" } });
		await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 20));
		fireEvent.change(box, { target: { value: "ivan fast" } });

		await waitFor(
			() =>
				expect(
					screen.getByText("Ivan Fastman", { selector: ".match-card__name" }),
				).toBeTruthy(),
			{ timeout: 1000 },
		);
		// Give the slower (earlier) search ample time to resolve and (wrongly)
		// clobber the UI if cancellation were broken.
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(
			screen.getByText("Ivan Fastman", { selector: ".match-card__name" }),
		).toBeTruthy();
		expect(screen.queryByText("Ivan Slowman")).toBeNull();
	});
});
