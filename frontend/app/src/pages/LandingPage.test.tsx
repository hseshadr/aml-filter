import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DEMO_STATS } from "../generated/landing-stats";
import { LandingPage } from "./LandingPage";

// The public marketing landing at "/". It is a static presentational page —
// no engine, no backend, no auth — so these tests just assert the sections
// render and the CTAs point at the right routes. Wrapped in a router because
// the CTAs are react-router <Link>s.
function renderPage() {
	return render(
		<MemoryRouter>
			<LandingPage />
		</MemoryRouter>,
	);
}

describe("LandingPage", () => {
	it("renders the hero headline and lede", () => {
		renderPage();
		expect(
			screen.getByRole("heading", { level: 1, name: /in your browser/i }),
		).toBeInTheDocument();
		// The lede states the privacy promise: nothing typed leaves the device.
		expect(screen.getByText(/nothing you type leaves/i)).toBeInTheDocument();
	});

	it("links the primary CTA to the in-browser demo at /screen", () => {
		renderPage();
		const cta = screen.getByRole("link", { name: /try the live demo/i });
		expect(cta).toHaveAttribute("href", "/screen");
	});

	it("links the secondary CTA to /login", () => {
		renderPage();
		const cta = screen.getByRole("link", { name: /admin login/i });
		expect(cta).toHaveAttribute("href", "/login");
	});

	it("renders the metrics band with KPI numbers derived from the source files", () => {
		renderPage();
		const band = screen.getByRole("region", { name: /metrics/i });
		// The two measured tiles follow the GENERATED single source of truth
		// (DEMO_STATS, derived from the demo list + the ONNX file) — NOT literals,
		// so this assertion can never bake in a number that has drifted from the
		// files. The other two ($0 infra, 0 bytes of PII) are intrinsic copy.
		expect(within(band).getByText("$0")).toBeInTheDocument();
		expect(
			within(band).getByText(String(DEMO_STATS.modelSizeMb)),
		).toBeInTheDocument();
		expect(
			within(band).getByText(String(DEMO_STATS.demoEntityCount)),
		).toBeInTheDocument();
		expect(within(band).getByText(/0 bytes/i)).toBeInTheDocument();
	});

	it("renders the three 'why' cards", () => {
		renderPage();
		const why = screen.getByRole("region", { name: /why/i });
		expect(within(why).getByText(/private/i)).toBeInTheDocument();
		expect(within(why).getByText(/offline/i)).toBeInTheDocument();
		expect(within(why).getByText(/verifiable/i)).toBeInTheDocument();
	});

	it("renders the how-it-works steps including the fail-closed verification", () => {
		renderPage();
		const how = screen.getByRole("region", { name: /how it works/i });
		expect(within(how).getByText(/ed25519/i)).toBeInTheDocument();
		expect(within(how).getByText(/fail-closed/i)).toBeInTheDocument();
	});

	it("renders the DB-backed compliance workstation section linking to login", () => {
		renderPage();
		const workstation = screen.getByRole("region", {
			name: /compliance workstation/i,
		});
		// It must be explicit this is the backend/DB (your own Postgres) tier.
		expect(within(workstation).getByText(/postgres/i)).toBeInTheDocument();
		expect(within(workstation).getByText(/file a sar/i)).toBeInTheDocument();
		const cta = within(workstation).getByRole("link", { name: /login/i });
		expect(cta).toHaveAttribute("href", "/login");
	});

	it("renders the footer credit", () => {
		renderPage();
		expect(screen.getByText(/portfolio demo/i)).toBeInTheDocument();
	});
});
