import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BundleCacheRecovery } from "../pages/bootErrorMessage";

interface CacheRecoveryProps {
	/** Which verification verdict the boot failed on (see bundleCacheRecovery). */
	readonly kind: BundleCacheRecovery;
	/** Drop the cached signed lists (and their rollback floor). Never the
	 * customer database. */
	readonly onClear: () => Promise<void>;
	/** Called once the clear succeeded — typically re-runs the boot. */
	readonly onCleared: () => void;
}

type Step =
	| { readonly kind: "idle"; readonly error: string | null }
	| { readonly kind: "confirming" }
	| { readonly kind: "clearing" };

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The in-app way out of a boot that failed verification, so the error card is
 * never a dead end: a link to Settings plus the "Clear cached lists" action
 * inline, behind a two-step confirm.
 *
 * NEVER clears on its own. A rollback refusal is the anti-rollback floor doing
 * its job — an attacker who can serve an old signed pointer would love an app
 * that wipes the floor for them — so the rollback case states the risk in plain
 * language before the user can act, and every case needs two deliberate clicks.
 */
export function CacheRecovery({
	kind,
	onClear,
	onCleared,
}: CacheRecoveryProps) {
	const { t } = useTranslation("common");
	const [step, setStep] = useState<Step>({ kind: "idle", error: null });

	async function clear(): Promise<void> {
		setStep({ kind: "clearing" });
		try {
			await onClear();
		} catch (error) {
			setStep({
				kind: "idle",
				error: t("cacheRecovery.failed", { detail: messageOf(error) }),
			});
			return;
		}
		setStep({ kind: "idle", error: null });
		onCleared();
	}

	return (
		<div className="cache-recovery" data-testid="cache-recovery">
			<p className="cache-recovery__note">
				{kind === "rollback"
					? t("cacheRecovery.rollbackWarning")
					: t("cacheRecovery.integrityHint")}
			</p>
			{step.kind === "confirming" ? (
				<div className="cache-recovery__confirm">
					<p>{t("cacheRecovery.confirmPrompt")}</p>
					<button
						type="button"
						className="btn btn-danger btn-sm"
						onClick={() => {
							void clear();
						}}
					>
						{t("cacheRecovery.confirm")}
					</button>{" "}
					<button
						type="button"
						className="btn btn-secondary btn-sm"
						onClick={() => setStep({ kind: "idle", error: null })}
					>
						{t("cacheRecovery.cancel")}
					</button>
				</div>
			) : step.kind === "clearing" ? (
				<p role="status">{t("cacheRecovery.clearing")}</p>
			) : (
				<div className="cache-recovery__actions">
					<button
						type="button"
						className="btn btn-secondary btn-sm"
						onClick={() => setStep({ kind: "confirming" })}
					>
						{t("cacheRecovery.clear")}
					</button>{" "}
					<a href="/settings">{t("cacheRecovery.settingsLink")}</a>
					{step.error !== null && (
						<p className="cache-recovery__error">{step.error}</p>
					)}
				</div>
			)}
		</div>
	);
}
