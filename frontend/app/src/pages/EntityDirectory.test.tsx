import type { Entity } from "@amlfilter/browser";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EntityDirectory } from "./EntityDirectory";

const REALISTIC_ENTITY_COUNT = 31_348;
const PAGE_SIZE = 24;

function entityAt(index: number): Entity {
	return {
		entity_id: `OFAC_SDN:${index}`,
		entity_type: "PERSON",
		primary_name: `Sanctions entity ${index}`,
		name_canonical: `sanctions entity ${index}`,
		aliases: [],
		dob: [],
		countries: [],
		nationalities: [],
		addresses: [],
		identifiers: { passport: [], national_id: [], other: {} },
		risk_category: "SANCTION",
		source_list: "OFAC_SDN",
		list_version: "2026-07-15",
	};
}

function realisticDirectory(): ReadonlyArray<Entity> {
	return Array.from({ length: REALISTIC_ENTITY_COUNT }, (_, index) =>
		entityAt(index + 1),
	);
}

afterEach(cleanup);

describe("EntityDirectory", () => {
	it("bounds the DOM for the full production-sized directory", () => {
		const { container } = render(
			<EntityDirectory entities={realisticDirectory()} />,
		);

		expect(container.querySelectorAll(".match-card")).toHaveLength(PAGE_SIZE);
		expect(screen.getByText("Sanctions entity 1")).toBeTruthy();
		expect(screen.getByText("Sanctions entity 24")).toBeTruthy();
		expect(screen.queryByText("Sanctions entity 25")).toBeNull();
		expect(screen.getByText("Showing 1–24 of 31,348 entities")).toBeTruthy();
	});

	it("exposes semantic pagination and moves deterministically between pages", () => {
		render(<EntityDirectory entities={realisticDirectory()} />);
		const pagination = screen.getByRole("navigation", {
			name: "Watchlist directory pages",
		});
		const previous = within(pagination).getByRole("button", {
			name: "Previous page",
		});
		const next = within(pagination).getByRole("button", { name: "Next page" });

		expect(previous).toHaveProperty("disabled", true);
		expect(next.tagName).toBe("BUTTON");
		next.focus();
		expect(document.activeElement).toBe(next);
		fireEvent.click(next);

		expect(screen.getByText("Sanctions entity 25")).toBeTruthy();
		expect(screen.getByText("Sanctions entity 48")).toBeTruthy();
		expect(screen.queryByText("Sanctions entity 1")).toBeNull();
		expect(screen.getByRole("status").textContent).toContain(
			"Showing 25–48 of 31,348 entities",
		);
		expect(previous).toHaveProperty("disabled", false);
	});
});
