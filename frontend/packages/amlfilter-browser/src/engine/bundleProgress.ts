/** AML's UI-facing cold-sync progress, intentionally smaller than the shared
 * engine lifecycle: the banner renders only authenticated chunk transfer. */
export interface SyncProgress {
	readonly fetched: number;
	readonly total: number;
	readonly bytes: number;
}

export type OnSyncProgress = (progress: SyncProgress) => void;
