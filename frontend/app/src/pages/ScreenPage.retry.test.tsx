import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A boot that fails the first time and succeeds on retry. `bootCalls` lets the
// test assert the boot effect re-fired after the Retry click.
const bootCalls = { count: 0 };

vi.mock("@amlfilter/browser", () => {
	class EngineRuntime {
		bootstrap(): Promise<void> {
			bootCalls.count += 1;
			if (bootCalls.count === 1) {
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
});

describe("ScreenPage — boot retry", () => {
	it("renders a Retry button in the error banner and re-runs boot on click", async () => {
		render(<ScreenPage />);

		// First boot rejects → the alert banner with a Retry button.
		const retry = await waitFor(() => {
			const banner = screen.getByRole("alert");
			expect(banner.textContent).toMatch(/timed out/i);
			return screen.getByRole("button", { name: /retry/i });
		});
		expect(bootCalls.count).toBe(1);

		fireEvent.click(retry);

		// The boot effect re-fired (second bootstrap call) and, this time
		// resolving, the page reaches its ready state (search box enabled).
		await waitFor(() => {
			const box = screen.getByPlaceholderText(/Search a name/);
			expect((box as HTMLInputElement).disabled).toBe(false);
		});
		expect(bootCalls.count).toBe(2);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
