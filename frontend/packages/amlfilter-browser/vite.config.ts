/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The package is consumed as TS source by the app's Vite build; this config
// exists only so the engine's Vitest suite (the signed-bundle sync state
// machine, the FAISS-flat vector reader, and the explainable screening port)
// runs standalone in a jsdom environment — the same environment the app uses.
export default defineConfig({
	test: {
		environment: "jsdom",
		globals: false,
	},
});
