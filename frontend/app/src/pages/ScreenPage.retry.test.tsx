import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A boot that fails until a retry has been requested, then succeeds. The
// reject/resolve decision is driven by `retryRequested` (call semantics), NOT
// by a consume-once counter — so StrictMode's dev double-invoke can never
// silently dequeue the "success" value and mask a double-fire regression.
// `bootCalls.count` separately records how many times bootstrap actually ran,
// letting us assert the ref guard absorbs the StrictMode double-invoke.
const bootCalls = { count: 0, retryRequested: false };

vi.mock("@amlfilter/browser", () => {
	class EngineRuntime {
		bootstrap(): Promise<void> {
			bootCalls.count += 1;
			if (!bootCalls.retryRequested) {
				return Promise.reject(
					new Error("loading the name-matching model timed out after 120000ms"),
				);
			}
			return Promise.resolve();
		}
		engine() {
			return {
				allEntities: () => [],
				screen: () =>
					Promise.resolve({
						request_id: "t",
						list_versions_used: {},
						execution_time_ms: 1,
						matches: [],
					}),
			};
		}
	}
	return { EngineRuntime, configFromEnv: () => ({}) };
});

import { ScreenPage } from "./ScreenPage";

afterEach(() => {
	cleanup();
	bootCalls.count = 0;
	bootCalls.retryRequested = false;
});

describe("ScreenPage — boot retry", () => {
	it("absorbs StrictMode's double-invoke (boot once), retries exactly once on click", async () => {
		// Rendered under StrictMode so React double-invokes the boot effect in dev.
		// The `started.current` ref guard must absorb the second invoke, so
		// bootstrap runs EXACTLY ONCE — not twice — on first mount.
		render(
			<StrictMode>
				<ScreenPage />
			</StrictMode>,
		);

		// First boot rejects → the alert banner with a Retry button.
		const retry = await waitFor(() => {
			const banner = screen.getByRole("alert");
			expect(banner.textContent).toMatch(/timed out/i);
			return screen.getByRole("button", { name: /retry/i });
		});
		// Ref guard absorbed StrictMode's double-invoke: exactly one boot, not two.
		expect(bootCalls.count).toBe(1);

		// Let the re-fired boot succeed this time.
		bootCalls.retryRequested = true;
		fireEvent.click(retry);

		// The boot effect re-fired (one more bootstrap call) and, this time
		// resolving, the page reaches its ready state (search box enabled).
		await waitFor(() => {
			const box = screen.getByPlaceholderText(/Search a name/);
			expect((box as HTMLInputElement).disabled).toBe(false);
		});
		// Exactly one additional boot from the single Retry click — not two.
		expect(bootCalls.count).toBe(2);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
