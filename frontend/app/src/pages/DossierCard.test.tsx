import {
	loadInstallKey,
	type Match,
	matchScoreSubject,
	signMatchReceipt,
} from "@amlfilter/browser";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DossierCard, dossierFromMatch } from "./DossierCard";

// A valid Ed25519 seed that is NOT this jsdom install's key — receipts signed
// with it must render the distinct untrusted-signer failure, never verified.
const FOREIGN_SEED_HEX = "ab".repeat(32);

function baseMatch(): Match {
	return {
		entity_id: "OFAC_SDN:0001",
		score: 0.914,
		entity_type: "PERSON",
		risk_category: "SANCTION",
		source_list: "OFAC_SDN",
		list_version: "2026-07-15",
		primary_name: "Ivan Fakovich",
		aliases: [],
		countries: [],
		nationalities: [],
		dob: ["1971-03-14"],
		addresses: [],
		identifiers: { passport: [], national_id: [], other: {} },
		reasons: [
			{
				signal: "name_similarity",
				value: 0.914,
				weight: 1,
				contribution: 0.914,
				description: "Name similarity 0.914",
			},
		],
		explanation: "Name similarity 0.914",
	};
}

/** Sign a real receipt for the base match — by default with THIS install's key. */
async function signedMatch(seedHex?: string): Promise<Match> {
	const subject = matchScoreSubject(
		{ score: 0.914, tier: "STRONG" },
		{
			engineVersion: "engine-test-1",
			watchlistVersion: "watchlist-test-1",
			inputsHash: `sha256:${"0".repeat(64)}`,
		},
	);
	const seed = seedHex ?? (await loadInstallKey(window.localStorage)).seedHex;
	return {
		...baseMatch(),
		score_receipt: await signMatchReceipt(subject, seed),
	};
}

function renderCard(match: Match) {
	return render(
		<ul>
			<DossierCard dossier={dossierFromMatch(match)} />
		</ul>,
	);
}

function headBadge(container: HTMLElement): Element | null {
	return container.querySelector(".match-card__head .receipt-status");
}

beforeEach(() => {
	window.localStorage.clear();
});
afterEach(cleanup);

describe("dossierFromMatch", () => {
	it("threads the signed score receipt through to the dossier", async () => {
		const match = await signedMatch();
		expect(dossierFromMatch(match).score_receipt).toBe(match.score_receipt);
	});
});

describe("DossierCard receipt verdict", () => {
	it("renders a Verified icon+text badge beside the score for a receipt signed by this install", async () => {
		const match = await signedMatch();
		const { container } = renderCard(match);

		await waitFor(() => {
			expect(headBadge(container)?.getAttribute("data-status")).toBe(
				"verified",
			);
		});
		const badge = headBadge(container);
		// The verdict must survive without color (WCAG 1.4.1): a distinct icon
		// AND a distinct word label, in a live status region.
		expect(badge?.getAttribute("role")).toBe("status");
		expect(
			badge
				?.querySelector(".receipt-status__icon")
				?.getAttribute("aria-hidden"),
		).toBe("true");
		expect(badge?.querySelector(".receipt-status__text")?.textContent).toBe(
			"Verified",
		);
		// Beside the score, not instead of it.
		expect(
			container.querySelector(".match-card__head .match-card__score")
				?.textContent,
		).toBe("0.914");
	});

	it("renders the distinct tampered failure state when the sealed payload is mutated", async () => {
		const match = await signedMatch();
		const receipt = match.score_receipt;
		if (receipt === undefined) throw new Error("test setup: receipt missing");
		const tampered: Match = {
			...match,
			score_receipt: {
				...receipt,
				payload: { ...receipt.payload, score: 0.999 },
			},
		};
		const { container } = renderCard(tampered);

		await waitFor(() => {
			expect(headBadge(container)?.getAttribute("data-status")).toBe("invalid");
		});
		expect(headBadge(container)?.textContent).toContain(
			"Not verified — tampered or invalid signature",
		);
	});

	it("renders the distinct untrusted-signer failure state for a receipt signed by a foreign key", async () => {
		// Pin this install's key first so the expected key exists and differs.
		await loadInstallKey(window.localStorage);
		const foreign = await signedMatch(FOREIGN_SEED_HEX);
		const { container } = renderCard(foreign);

		await waitFor(() => {
			expect(headBadge(container)?.getAttribute("data-status")).toBe(
				"wrong-key",
			);
		});
		expect(headBadge(container)?.textContent).toContain(
			"Not verified — untrusted signer",
		);
	});

	it("re-judges a new receipt against the key the store holds NOW (fail-closed on rekey)", async () => {
		const match = await signedMatch();
		const receipt = match.score_receipt;
		if (receipt === undefined) throw new Error("test setup: receipt missing");
		const { container, rerender } = renderCard(match);
		await waitFor(() => {
			expect(headBadge(container)?.getAttribute("data-status")).toBe(
				"verified",
			);
		});

		// The store re-keys (the e2e drives this via a localStorage swap); the
		// next screen's receipt still arrives signed by the OLD key because the
		// engine's sealer pins its key at first seal. The badge must drop to the
		// untrusted-signer state — never stay green against a stale key.
		window.localStorage.clear();
		const rekeyed: Match = { ...match, score_receipt: { ...receipt } };
		rerender(
			<ul>
				<DossierCard dossier={dossierFromMatch(rekeyed)} />
			</ul>,
		);
		await waitFor(() => {
			expect(headBadge(container)?.getAttribute("data-status")).toBe(
				"wrong-key",
			);
		});
	});

	it("renders no receipt UI at all for a match without a receipt", () => {
		const { container } = renderCard(baseMatch());
		expect(container.querySelector(".receipt-status")).toBeNull();
		expect(container.querySelector(".match-card__receipt")).toBeNull();
		expect(screen.queryByText("Score receipt")).toBeNull();
	});
});

describe("DossierCard receipt panel", () => {
	it("discloses the full signed-receipt panel with envelope and sealed subject", async () => {
		const match = await signedMatch();
		const { container } = renderCard(match);

		// The disclosure appears once the install key (the trust anchor) has
		// loaded — no verdict UI renders against a missing key (fail-closed).
		await waitFor(() => {
			expect(
				container.querySelector("details.match-card__receipt"),
			).not.toBeNull();
		});
		const disclosure = container.querySelector("details.match-card__receipt");
		expect(disclosure?.querySelector("summary")?.textContent).toBe(
			"Score receipt",
		);

		const panel = container.querySelector("section.receipt-panel");
		expect(panel).not.toBeNull();
		await waitFor(() => {
			expect(
				panel?.querySelector(".receipt-status")?.getAttribute("data-status"),
			).toBe("verified");
		});
		// Envelope metadata comes from the receipt-ui panel itself.
		expect(panel?.textContent).toContain("Ed25519");
		// The sealed subject renders through the card's payload renderer.
		expect(screen.getByText("sealed score")).toBeTruthy();
		expect(panel?.textContent).toContain("0.914");
		expect(panel?.textContent).toContain("STRONG");
		expect(screen.getByText("engine-test-1")).toBeTruthy();
		expect(screen.getByText("watchlist-test-1")).toBeTruthy();
	});
});
