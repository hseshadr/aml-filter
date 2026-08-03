import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

	it("names small and medium businesses with KYC obligations", () => {
		renderPage();
		expect(
			screen.getByText(
				/small and medium-sized businesses with KYC obligations/i,
			),
		).toBeInTheDocument();
	});

	it("links the primary CTA to the in-browser demo at /screen", () => {
		renderPage();
		const cta = screen.getByRole("link", { name: /try the live demo/i });
		expect(cta).toHaveAttribute("href", "/screen");
	});

	it("links the secondary CTA to the workstation", () => {
		renderPage();
		const cta = screen.getByRole("link", { name: /open the workstation/i });
		expect(cta).toHaveAttribute("href", "/customers");
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
		// Was /offline/i, matching a card titled "Local / Offline". The app has no
		// service worker, so a reload with the network off fails outright — the
		// card was named for a capability that does not exist. The title is now
		// "Local"; matching on /offline/i here would pass on the withdrawal text
		// ("there is no offline mode") and prove nothing, so it pins the title.
		expect(within(why).getByText("Local")).toBeInTheDocument();
		expect(within(why).getByText(/verifiable/i)).toBeInTheDocument();
	});

	it("does not promise the app keeps working with no network", () => {
		// The claim this guards: AML-Filter screens IN THE TAB (true) but is not
		// an offline app (false until a service worker exists). The 'why' card
		// must say so rather than implying a cached bundle means offline use.
		renderPage();
		const why = screen.getByRole("region", { name: /why/i });
		expect(within(why).queryByText(/with no network at all/i)).toBeNull();
		expect(within(why).getByText(/no offline mode/i)).toBeInTheDocument();
	});

	it("renders the how-it-works steps including the fail-closed verification", () => {
		renderPage();
		const how = screen.getByRole("region", { name: /how it works/i });
		expect(within(how).getByText(/ed25519/i)).toBeInTheDocument();
		expect(within(how).getByText(/fail-closed/i)).toBeInTheDocument();
	});

	it("renders the local-first workstation section linking to /customers", () => {
		renderPage();
		const workstation = screen.getByRole("region", {
			name: /compliance workstation/i,
		});
		expect(within(workstation).getByText(/opfs/i)).toBeInTheDocument();
		expect(
			within(workstation).getByText(/tiered review board/i),
		).toBeInTheDocument();
		const cta = within(workstation).getByRole("link", {
			name: /start onboarding/i,
		});
		expect(cta).toHaveAttribute("href", "/customers");
	});

	it("renders the footer credit", () => {
		renderPage();
		expect(screen.getByText(/portfolio engineering demo/i)).toBeInTheDocument();
	});
});
