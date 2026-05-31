import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function wrapper({ children }: { children: ReactNode }) {
	return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it("starts unauthenticated when no key is stored", () => {
		const { result } = renderHook(() => useAuth(), { wrapper });
		expect(result.current.isAuthenticated).toBe(false);
		expect(result.current.apiKey).toBeNull();
	});

	it("hydrates the key from localStorage on mount", () => {
		localStorage.setItem("api_key", "stored-key");
		const { result } = renderHook(() => useAuth(), { wrapper });
		expect(result.current.apiKey).toBe("stored-key");
		expect(result.current.isAuthenticated).toBe(true);
	});

	it("setApiKey persists the key to localStorage", () => {
		const { result } = renderHook(() => useAuth(), { wrapper });
		act(() => {
			result.current.setApiKey("fresh-key");
		});
		expect(result.current.apiKey).toBe("fresh-key");
		expect(result.current.isAuthenticated).toBe(true);
		expect(localStorage.getItem("api_key")).toBe("fresh-key");
	});

	it("logout clears the key from state and localStorage", () => {
		localStorage.setItem("api_key", "stored-key");
		const { result } = renderHook(() => useAuth(), { wrapper });
		act(() => {
			result.current.logout();
		});
		expect(result.current.apiKey).toBeNull();
		expect(result.current.isAuthenticated).toBe(false);
		expect(localStorage.getItem("api_key")).toBeNull();
	});

	it("useAuth throws when used outside an AuthProvider", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		function Orphan() {
			useAuth();
			return null;
		}
		expect(() => render(<Orphan />)).toThrow(
			"useAuth must be used within an AuthProvider",
		);
	});
});
