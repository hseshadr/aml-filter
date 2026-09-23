import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { CacheRecovery } from "./CacheRecovery";

afterEach(cleanup);

function renderRecovery(
	kind: "rollback" | "integrity",
	onClear: () => Promise<void> = () => Promise.resolve(),
) {
	const clear = vi.fn(onClear);
	const cleared = vi.fn();
	render(<CacheRecovery kind={kind} onClear={clear} onCleared={cleared} />);
	return { clear, cleared };
}

describe("CacheRecovery", () => {
	it("offers the clear and a Settings link for an integrity failure, behind a confirm", async () => {
		const { clear, cleared } = renderRecovery("integrity");
		expect(
			screen.getByRole("link", { name: /open settings/i }).getAttribute("href"),
		).toBe("/settings");
		expect(screen.queryByText(/older version/i)).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: /clear cached lists/i }),
		);
		// Step one only arms the confirm; nothing is cleared yet.
		expect(clear).not.toHaveBeenCalled();
		fireEvent.click(
			screen.getByRole("button", { name: /yes, clear cached lists/i }),
		);
		await waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));
		expect(clear).toHaveBeenCalledTimes(1);
	});

	it("warns before a rollback clear and never clears on its own", () => {
		const { clear } = renderRecovery("rollback");
		const warning = screen.getByText(/older version of the screening lists/i);
		expect(warning.textContent).toMatch(/tampering/i);
		expect(warning.textContent).toMatch(/only clear if you trust/i);
		expect(clear).not.toHaveBeenCalled();

		fireEvent.click(
			screen.getByRole("button", { name: /clear cached lists/i }),
		);
		expect(clear).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: /yes, clear cached lists/i }),
		).toBeTruthy();
	});

	it("cancel backs out of the confirm without clearing", () => {
		const { clear } = renderRecovery("rollback");
		fireEvent.click(
			screen.getByRole("button", { name: /clear cached lists/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		expect(clear).not.toHaveBeenCalled();
		expect(
			screen.queryByRole("button", { name: /yes, clear cached lists/i }),
		).toBeNull();
		expect(
			screen.getByRole("button", { name: /clear cached lists/i }),
		).toBeTruthy();
	});

	it("surfaces a failed clear and does not report success", async () => {
		const { cleared } = renderRecovery("integrity", () =>
			Promise.reject(new Error("clearing cached lists timed out")),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /clear cached lists/i }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /yes, clear cached lists/i }),
		);
		await waitFor(() => expect(screen.getByText(/timed out/i)).toBeTruthy());
		expect(cleared).not.toHaveBeenCalled();
		// The user can try again.
		expect(
			screen.getByRole("button", { name: /clear cached lists/i }),
		).toBeTruthy();
	});
});
