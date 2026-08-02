// The Worker-boundary test for engine failures.
//
// The existing suites (client.test.ts, bundleSource.test.ts) drive an
// *in-process* stand-in for the Worker: `bundleSource.test.ts:86` says so
// outright — "An in-process BundleEngineClient mirroring worker.ts". In-process
// means the thrown error object is handed to the assertion by reference, so its
// class and `.name` survive trivially. Every type-based branch downstream was
// therefore exercised in a context where the type could not be lost — the tests
// asserted the registry's behavior, not the system's.
//
// This file re-creates the ONE property that makes the real boundary lossy:
// every reply crosses `structuredClone`, which is precisely what `postMessage`
// applies. Structured clone copies data and drops prototypes, so a
// `SignatureError` that crosses it is no longer a `SignatureError`. If the
// envelope does not carry the type as data, it is gone.
//
// PROVEN ABLE TO FAIL: revert `client.ts`'s `fromErrorResponse(response)` to
// `new Error(response.error)` (or drop `errorName` from `worker.ts`'s catch) and
// both assertions below go red with `.name === "Error"`.

import { describe, expect, it } from "vitest";
import { SignatureError } from "../crypto";
import { EngineClient } from "./client";
import { toErrorResponse } from "./errorEnvelope";
import { IntegrityError } from "./integrity";
import type { EngineOutbound, EngineRequest } from "./protocol";
import { QuotaError } from "./storage";

type MessageListener = (event: MessageEvent<EngineOutbound>) => void;

/**
 * A Worker stand-in whose replies cross a real `structuredClone`, exactly as
 * `postMessage` does. The "worker side" builds its reply with the SAME
 * `toErrorResponse` the real `worker.ts` catch block uses, so this test and
 * production share one serializer — changing one changes the other.
 */
function workerThatThrows(thrown: unknown): {
	readonly worker: ConstructorParameters<typeof EngineClient>[0];
	terminated: () => boolean;
} {
	let listener: MessageListener | null = null;
	let terminated = false;
	const worker = {
		postMessage(request: EngineRequest): void {
			// The worker side: catch → envelope → postMessage (structured clone).
			const reply = structuredClone(toErrorResponse(request.id, thrown));
			queueMicrotask(() => {
				listener?.({ data: reply } as MessageEvent<EngineOutbound>);
			});
		},
		addEventListener(type: string, handler: unknown): void {
			if (type === "message") {
				listener = handler as MessageListener;
			}
		},
		terminate(): void {
			terminated = true;
		},
	};
	return {
		worker: worker as unknown as ConstructorParameters<typeof EngineClient>[0],
		terminated: () => terminated,
	};
}

async function caughtFromSync(thrown: unknown): Promise<Error> {
	const { worker } = workerThatThrows(thrown);
	const client = new EngineClient(worker);
	try {
		await client.sync("/bundle/origin", "/public.key");
	} catch (error) {
		return error as Error;
	} finally {
		client.terminate();
	}
	throw new Error("expected sync to reject");
}

describe("engine error type across the Worker boundary", () => {
	it("carries SignatureError's type to the main thread", async () => {
		const caught = await caughtFromSync(
			new SignatureError("signature verification failed"),
		);

		expect(caught.name).toBe("SignatureError");
		expect(caught.message).toBe("signature verification failed");
	});

	it("carries every typed failure the registry branches on", async () => {
		// One case per `.name`-matched branch in the app's bundle-error registry.
		// A branch missing from this list is a branch nothing proves reachable in
		// production.
		const cases: ReadonlyArray<readonly [unknown, string]> = [
			[new SignatureError(), "SignatureError"],
			[
				new IntegrityError("chunk abc failed its content-address check"),
				"IntegrityError",
			],
			[new QuotaError("not enough room for the bundle"), "QuotaError"],
		];

		for (const [thrown, expectedName] of cases) {
			const caught = await caughtFromSync(thrown);
			expect(caught.name).toBe(expectedName);
		}
	});

	it("degrades to a plain Error for a non-Error throw", async () => {
		const caught = await caughtFromSync("something went sideways");

		expect(caught.name).toBe("Error");
		expect(caught.message).toBe("something went sideways");
	});

	it("carries the type on readFile failures too", async () => {
		const { worker } = workerThatThrows(new IntegrityError("bad chunk"));
		const client = new EngineClient(worker);

		await expect(client.readFile("ofac/vectors.f32")).rejects.toMatchObject({
			name: "IntegrityError",
		});
		client.terminate();
	});
});
