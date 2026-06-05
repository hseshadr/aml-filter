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

// Build a Match-like double carrying a name_trigram reason of the given value,
// so the strictness gate (which reads that reason) can be driven deterministically.
function matchWithTrigram(
	over: { entity_id: string; primary_name: string },
	trigram: number,
): typeof ivanMatch {
	return {
		...ivanMatch,
		entity_id: over.entity_id,
		primary_name: over.primary_name,
		score: 0.301,
		reasons: [
			{
				signal: "name_vector",
				value: 0.45,
				weight: 0.55,
				contribution: 0.2475,
				description: "Vector similarity: 0.450",
			},
			{
				signal: "name_trigram",
				value: trigram,
				weight: 0.2,
				contribution: trigram * 0.2,
				description: `Trigram similarity: ${trigram.toFixed(3)}`,
			},
		],
	};
}

// The strictness scenario: a real query ("ivan fal") that the engine returns
// BOTH an intended close hit (Ivan, high trigram ~0.667) AND irrelevant vector
// noise (Hassan-like, low trigram ~0.261) for. The combined-score floor lets the
// noise through; the lexical gate is what hides it at Balanced/Strict.
const ivanCloseMatch = matchWithTrigram(
	{ entity_id: "DEMO:IVAN", primary_name: "Ivan Fakovich" },
	0.667,
);
const hassanNoiseMatch = matchWithTrigram(
	{ entity_id: "DEMO:HASSAN", primary_name: "Hassan Pretendi" },
	0.261,
);
// The token-containment case: a short query ("bank") against a long org name has
// a tiny trigram (~0.267 < 0.35) yet must be KEPT because the query token "bank"
// is one of the entity's canonical name tokens.
const bankMatch = matchWithTrigram(
	{ entity_id: "DEMO:BANK", primary_name: "Madeupistan Imaginary Bank" },
	0.267,
);

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

// Thresholds the page passed to engine.screen, in call order — lets a test
// assert the strictness level maps to the documented floor.
const observedThresholds: Array<number | undefined> = [];

// The page builds its own EngineRuntime; mock the module so the test drives a
// deterministic engine with no Worker/bundle/model.
vi.mock("@amlfilter/browser", async (importActual) => {
	// Keep the REAL canonicalize so the page's token-containment tokenizes names
	// exactly as the engine's trigram does — only the runtime/engine is faked.
	const actual = await importActual<typeof import("@amlfilter/browser")>();
	class EngineRuntime {
		bootstrap(): Promise<void> {
			return Promise.resolve();
		}
		engine() {
			return {
				allEntities: () => [ivanEntity, olgaEntity],
				screen: ({ name, threshold }: { name: string; threshold?: number }) => {
					const lower = name.toLowerCase();
					// Record the floor the page passed per call so a test can assert
					// the strictness level actually changes the engine threshold.
					observedThresholds.push(threshold);
					// "ivan fal": the engine returns the close hit AND the vector
					// noise; the page's lexical gate decides which survive.
					if (lower.includes("ivan fal")) {
						return Promise.resolve({
							request_id: "ivanfal",
							list_versions_used: {},
							execution_time_ms: 3,
							matches: [ivanCloseMatch, hassanNoiseMatch],
						});
					}
					// "bank": low-trigram org kept only via token-containment.
					if (lower === "bank") {
						return Promise.resolve({
							request_id: "bank",
							list_versions_used: {},
							execution_time_ms: 3,
							matches: [bankMatch],
						});
					}
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
	return {
		...actual,
		EngineRuntime,
		configFromEnv: () => ({}),
	};
});

import { ScreenPage } from "./ScreenPage";

afterEach(() => {
	cleanup();
	observedThresholds.length = 0;
});

// Wait until the search box is enabled (boot resolved) and return it.
async function readyBox(): Promise<HTMLInputElement> {
	return (await waitFor(() => {
		const el = screen.getByPlaceholderText(/Search a name/);
		expect((el as HTMLInputElement).disabled).toBe(false);
		return el;
	})) as HTMLInputElement;
}

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

	it("exposes a labeled, keyboard-operable strictness radiogroup defaulting to Balanced", async () => {
		render(<ScreenPage />);
		await readyBox();
		const group = screen.getByRole("radiogroup", { name: /match strictness/i });
		expect(group).toBeTruthy();
		const balanced = screen.getByRole("radio", { name: /balanced/i });
		expect(balanced.getAttribute("aria-checked")).toBe("true");
		// ArrowRight from Balanced selects Strict.
		balanced.focus();
		fireEvent.keyDown(balanced, { key: "ArrowRight" });
		await waitFor(() =>
			expect(
				screen
					.getByRole("radio", { name: /strict/i })
					.getAttribute("aria-checked"),
			).toBe("true"),
		);
	});

	it("hides low-trigram vector noise at the default Balanced strictness", async () => {
		render(<ScreenPage />);
		const box = await readyBox();
		fireEvent.change(box, { target: { value: "ivan fal" } });
		await waitFor(() =>
			expect(
				screen.getByText("Ivan Fakovich", { selector: ".match-card__name" }),
			).toBeTruthy(),
		);
		// Hassan is vector noise (trigram 0.261 < 0.35, no token overlap) → dropped.
		expect(screen.queryByText("Hassan Pretendi")).toBeNull();
	});

	it("shows the noise again when switched to Lenient and re-runs the search", async () => {
		render(<ScreenPage />);
		const box = await readyBox();
		fireEvent.change(box, { target: { value: "ivan fal" } });
		await waitFor(() =>
			expect(
				screen.getByText("Ivan Fakovich", { selector: ".match-card__name" }),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole("radio", { name: /lenient/i }));
		// Changing strictness re-runs search live; the noise now reappears.
		await waitFor(() =>
			expect(
				screen.getByText("Hassan Pretendi", { selector: ".match-card__name" }),
			).toBeTruthy(),
		);
		expect(
			screen.getByText("Ivan Fakovich", { selector: ".match-card__name" }),
		).toBeTruthy();
		// Lenient passes the lower floor (0.30); Strict would pass 0.40.
		expect(observedThresholds).toContain(0.3);
	});

	it("keeps only the closest match under Strict", async () => {
		render(<ScreenPage />);
		const box = await readyBox();
		fireEvent.change(box, { target: { value: "ivan fal" } });
		await waitFor(() =>
			expect(
				screen.getByText("Ivan Fakovich", { selector: ".match-card__name" }),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole("radio", { name: /strict/i }));
		// Ivan's trigram (0.667) clears Strict's 0.50; Hassan's (0.261) never does.
		await waitFor(() => expect(observedThresholds).toContain(0.4));
		expect(screen.queryByText("Hassan Pretendi")).toBeNull();
		expect(
			screen.getByText("Ivan Fakovich", { selector: ".match-card__name" }),
		).toBeTruthy();
	});

	it("keeps a short keyword match via token-containment even below minLexical (the 'bank' case)", async () => {
		render(<ScreenPage />);
		const box = await readyBox();
		// "bank" vs "Madeupistan Imaginary Bank": trigram 0.267 < 0.35, but the
		// query token "bank" equals an entity name token → KEPT at Balanced.
		fireEvent.change(box, { target: { value: "bank" } });
		await waitFor(() =>
			expect(
				screen.getByText("Madeupistan Imaginary Bank", {
					selector: ".match-card__name",
				}),
			).toBeTruthy(),
		);
	});
});
