/**
 * Boot + identity gate for the local-first workstation routes. Order:
 *   1. open the DB Worker (SQLite-WASM/OPFS) — blocking, fast;
 *   2. one-time analyst-name prompt (a SQLite settings row, spec §9.5);
 *   3. render children, with the OFAC engine bootstrapping in the BACKGROUND
 *      (a status strip mirrors /screen's staged boot UX; onboarding awaits
 *      the engine internally, the review board never needs it).
 */

import type { BootStage } from "@amlfilter/browser";
import { ANALYST_NAME_KEY } from "@amlfilter/workstation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { workstation } from "../lib/workstation";

type GatePhase =
	| { kind: "booting" }
	| { kind: "name-needed" }
	| { kind: "ready" }
	| { kind: "error"; message: string };

interface WorkstationGateProps {
	children: ReactNode;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function WorkstationGate({ children }: WorkstationGateProps) {
	const [phase, setPhase] = useState<GatePhase>({ kind: "booting" });
	const [nonce, setNonce] = useState(0);
	const [name, setName] = useState("");

	// nonce is not read in the body — it is the intentional re-fire trigger:
	// Retry bumps it so this effect re-runs the DB boot (workstation() cleared
	// its memo when the prior attempt rejected).
	// biome-ignore lint/correctness/useExhaustiveDependencies: nonce is an intentional re-fire trigger, not read in the body
	useEffect(() => {
		let cancelled = false;
		setPhase({ kind: "booting" });
		// Ask the browser to protect OPFS from eviction (spec risk: quota /
		// eviction). Best-effort: jsdom/tests and older browsers lack it.
		void navigator.storage?.persist?.().catch(() => undefined);
		workstation()
			.then(async (handle) => {
				const stored = await handle.store.getSetting(ANALYST_NAME_KEY);
				if (!cancelled) {
					setPhase(stored ? { kind: "ready" } : { kind: "name-needed" });
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setPhase({ kind: "error", message: messageOf(error) });
				}
			});
		return () => {
			cancelled = true;
		};
	}, [nonce]);

	const handleNameSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		try {
			const handle = await workstation();
			await handle.store.setSetting(ANALYST_NAME_KEY, trimmed);
			setPhase({ kind: "ready" });
		} catch (error) {
			setPhase({ kind: "error", message: messageOf(error) });
		}
	};

	if (phase.kind === "booting") {
		return (
			<div className="card card-muted" role="status" aria-live="polite">
				Opening the local KYC database…
			</div>
		);
	}

	if (phase.kind === "error") {
		return (
			<div className="alert alert-error">
				<p>{phase.message}</p>
				<button
					type="button"
					className="btn btn-primary"
					onClick={() => setNonce((n) => n + 1)}
				>
					Retry
				</button>
			</div>
		);
	}

	if (phase.kind === "name-needed") {
		return (
			<form
				onSubmit={handleNameSubmit}
				aria-label="Set analyst name"
				className="card card-muted"
			>
				<h2>Welcome to the workstation</h2>
				<p className="text-muted">
					Your name is stamped on review decisions for the audit trail. It is
					stored only in this browser (a local SQLite settings row) — there is
					no account and no server.
				</p>
				<label htmlFor="analyst-name" className="form-label">
					Analyst name
				</label>
				<input
					id="analyst-name"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
					className="form-input"
				/>
				<button type="submit" className="btn btn-primary">
					Start reviewing
				</button>
			</form>
		);
	}

	return (
		<>
			<EngineStatusStrip />
			{children}
		</>
	);
}

function engineStageLabel(stage: BootStage): string | null {
	if (stage.kind === "syncing") return "syncing the sanctions list…";
	if (stage.kind === "synced" || stage.kind === "reassembling")
		return "preparing the screening index…";
	if (stage.kind === "loading-model") {
		const pct = stage.progress ? ` ${Math.round(stage.progress.pct)}%` : "";
		return `loading the name-matching model…${pct}`;
	}
	return null; // ready
}

function EngineStatusStrip() {
	const [stage, setStage] = useState<BootStage | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [nonce, setNonce] = useState(0);

	// nonce is not read in the body — it is the intentional re-fire trigger:
	// Retry bumps it so this effect re-kicks the background engine bootstrap.
	// biome-ignore lint/correctness/useExhaustiveDependencies: nonce is an intentional re-fire trigger, not read in the body
	useEffect(() => {
		let cancelled = false;
		setError(null);
		workstation()
			.then((handle) =>
				handle.engineBoot((s) => {
					if (!cancelled) setStage(s);
				}),
			)
			.catch((bootError: unknown) => {
				if (!cancelled) setError(messageOf(bootError));
			});
		return () => {
			cancelled = true;
		};
	}, [nonce]);

	if (error !== null) {
		return (
			<div className="alert alert-warning" role="status">
				Screening engine unavailable: {error}{" "}
				<button
					type="button"
					className="btn btn-secondary btn-sm"
					onClick={() => setNonce((n) => n + 1)}
				>
					Retry
				</button>
			</div>
		);
	}

	const label = stage === null ? null : engineStageLabel(stage);
	if (label === null) {
		return null;
	}
	return (
		<div className="card card-muted text-sm" role="status" aria-live="polite">
			Screening engine: {label}
		</div>
	);
}
