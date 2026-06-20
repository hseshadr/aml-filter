/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The publisher is a Node-only tool (it reads files, embeds, signs, and writes
// the static watchlist artifact). Tests run in the NODE environment and inject a
// fake embedder, so the suite never touches the ~23 MB MiniLM weights — the real
// model is exercised by the `build-demo` script and its produced artifact.
export default defineConfig({
	test: {
		environment: "node",
		globals: false,
	},
});
