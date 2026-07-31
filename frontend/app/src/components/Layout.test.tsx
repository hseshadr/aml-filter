import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Layout from "./Layout";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			(
				({
					"nav.brandAlt": "AML-Filter",
					"nav.brand": "AML-Filter",
					"nav.screen": "Screen",
					"nav.customers": "Customers",
					"nav.review": "Review",
					"nav.settings": "Settings",
					layoutFooter: "Local-first screening",
					layoutFooterSource: "Source code on GitHub (MIT)",
				}) as Record<string, string>
			)[key] ?? key,
	}),
}));

describe("Layout", () => {
	it("offers the reader the public source repository from the footer", () => {
		render(
			<MemoryRouter initialEntries={["/screen"]}>
				<Layout>
					<div>page</div>
				</Layout>
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("link", { name: "Source code on GitHub (MIT)" }),
		).toHaveAttribute("href", "https://github.com/hseshadr/aml-filter");
	});

	it("marks the current workspace route and exposes named primary navigation", () => {
		render(
			<MemoryRouter initialEntries={["/review"]}>
				<Layout>
					<div>page</div>
				</Layout>
			</MemoryRouter>,
		);

		expect(screen.getByRole("navigation", { name: /primary/i })).toBeVisible();
		expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(screen.getByRole("link", { name: "Screen" })).not.toHaveAttribute(
			"aria-current",
		);
	});
});
