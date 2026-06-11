/** Review / case board — analyst triage of sanctions matches (the /v1/review tier). */

import { useCallback, useEffect, useState } from "react";
import {
	apiClient,
	type MatchTier,
	type ReviewDisposition,
	type ReviewMatch,
	type ReviewMatchListParams,
	type ReviewResolutionStatus,
} from "../lib/api";

const TIER_FILTERS: MatchTier[] = ["STRONG", "POSSIBLE", "WEAK"];

const STATUS_FILTERS: ReviewResolutionStatus[] = [
	"PENDING",
	"TRUE_POSITIVE",
	"FALSE_POSITIVE",
	"RESOLVED",
];

const DISPOSITIONS: ReviewDisposition[] = [
	"TRUE_POSITIVE",
	"FALSE_POSITIVE",
	"RESOLVED",
];

function tierBadgeClass(tier: MatchTier): string {
	if (tier === "STRONG") return "badge badge-danger";
	if (tier === "POSSIBLE") return "badge badge-warning";
	return "badge badge-muted";
}

function statusBadgeClass(status: ReviewResolutionStatus): string {
	if (status === "PENDING") return "badge badge-warning";
	if (status === "TRUE_POSITIVE") return "badge badge-danger";
	if (status === "FALSE_POSITIVE") return "badge badge-success";
	return "badge badge-muted";
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

interface ResolveDraft {
	disposition: ReviewDisposition;
	reviewer_id: string;
	review_notes: string;
}

const EMPTY_DRAFT: ResolveDraft = {
	disposition: "FALSE_POSITIVE",
	reviewer_id: "",
	review_notes: "",
};

export default function ReviewBoardPage() {
	const [matches, setMatches] = useState<ReviewMatch[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [tier, setTier] = useState<MatchTier | "">("");
	const [status, setStatus] = useState<ReviewResolutionStatus | "">("");
	const [drafts, setDrafts] = useState<Record<string, ResolveDraft>>({});

	const loadMatches = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const params: ReviewMatchListParams = {};
			if (tier) params.tier = tier;
			if (status) params.resolution_status = status;
			const data = await apiClient.listReviewMatches(params);
			setMatches(data);
		} catch (err) {
			setError(errorMessage(err, "Failed to load matches"));
		} finally {
			setLoading(false);
		}
	}, [tier, status]);

	useEffect(() => {
		loadMatches();
	}, [loadMatches]);

	const draftFor = (matchId: string): ResolveDraft =>
		drafts[matchId] ?? EMPTY_DRAFT;

	const updateDraft = (
		matchId: string,
		field: keyof ResolveDraft,
		value: string,
	) =>
		setDrafts((prev) => ({
			...prev,
			[matchId]: { ...draftFor(matchId), [field]: value },
		}));

	const handleResolve = async (match: ReviewMatch) => {
		const draft = draftFor(match.match_id);
		try {
			setError(null);
			const updated = await apiClient.resolveReviewMatch(
				match.match_id,
				draft.disposition,
				{
					reviewer_id: draft.reviewer_id || undefined,
					review_notes: draft.review_notes || undefined,
				},
			);
			setMatches((prev) =>
				prev.map((m) => (m.match_id === updated.match_id ? updated : m)),
			);
		} catch (err) {
			setError(errorMessage(err, "Failed to resolve match"));
		}
	};

	const pendingCount = matches.filter(
		(m) => m.resolution_status === "PENDING",
	).length;

	return (
		<div>
			<h1>Review Board</h1>
			<p className="text-muted">
				Triage sanctions matches by strength. Strongest hits are listed first.
			</p>

			{error && <div className="alert alert-error">Error: {error}</div>}

			<div className="form-group form-grid mb-md">
				<div>
					<label htmlFor="tier-filter" className="form-label">
						Filter by Tier
					</label>
					<select
						id="tier-filter"
						value={tier}
						onChange={(e) => setTier(e.target.value as MatchTier | "")}
						className="form-select"
					>
						<option value="">All tiers</option>
						{TIER_FILTERS.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
				</div>
				<div>
					<label htmlFor="status-filter" className="form-label">
						Filter by Status
					</label>
					<select
						id="status-filter"
						value={status}
						onChange={(e) =>
							setStatus(e.target.value as ReviewResolutionStatus | "")
						}
						className="form-select"
					>
						<option value="">All statuses</option>
						{STATUS_FILTERS.map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
				</div>
			</div>

			<h2>
				Matches ({matches.length}, {pendingCount} pending)
			</h2>

			{loading ? (
				<p>Loading...</p>
			) : matches.length === 0 ? (
				<p>No matches for the current filters.</p>
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>Tier</th>
							<th>Customer</th>
							<th>Matched Entity</th>
							<th>Score</th>
							<th>Status</th>
							<th>Reviewer / Notes</th>
							<th className="table-cell-right">Resolve</th>
						</tr>
					</thead>
					<tbody>
						{matches.map((match) => (
							<tr key={match.match_id}>
								<td>
									<span className={tierBadgeClass(match.tier)}>
										{match.tier}
									</span>
								</td>
								<td>
									<div>
										<strong>{match.customer_reference}</strong>
									</div>
									<div className="text-sm text-muted">
										{match.customer_name}
									</div>
								</td>
								<td>
									<div>{match.sanctioned_name}</div>
									<div className="text-sm text-muted">{match.source_list}</div>
								</td>
								<td>{(match.match_score * 100).toFixed(1)}%</td>
								<td>
									<span className={statusBadgeClass(match.resolution_status)}>
										{match.resolution_status}
									</span>
								</td>
								<td className="text-sm">
									<div>{match.reviewer_id ?? "-"}</div>
									{match.review_notes && (
										<div className="text-muted">{match.review_notes}</div>
									)}
								</td>
								<td className="table-cell-right">
									{match.resolution_status === "PENDING" ? (
										<ResolveControls
											match={match}
											draft={draftFor(match.match_id)}
											onChange={(field, value) =>
												updateDraft(match.match_id, field, value)
											}
											onResolve={() => handleResolve(match)}
										/>
									) : (
										<span className="text-muted text-sm">Resolved</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

interface ResolveControlsProps {
	match: ReviewMatch;
	draft: ResolveDraft;
	onChange: (field: keyof ResolveDraft, value: string) => void;
	onResolve: () => void;
}

function ResolveControls({
	match,
	draft,
	onChange,
	onResolve,
}: ResolveControlsProps) {
	const ref = match.customer_reference ?? match.match_id;
	return (
		<div className="flex-gap-sm">
			<select
				aria-label={`Disposition for ${ref}`}
				value={draft.disposition}
				onChange={(e) =>
					onChange("disposition", e.target.value as ReviewDisposition)
				}
				className="form-select"
			>
				{DISPOSITIONS.map((d) => (
					<option key={d} value={d}>
						{d}
					</option>
				))}
			</select>
			<input
				type="text"
				aria-label={`Reviewer for ${ref}`}
				placeholder="Reviewer ID"
				value={draft.reviewer_id}
				onChange={(e) => onChange("reviewer_id", e.target.value)}
				className="form-input"
			/>
			<input
				type="text"
				aria-label={`Notes for ${ref}`}
				placeholder="Notes"
				value={draft.review_notes}
				onChange={(e) => onChange("review_notes", e.target.value)}
				className="form-input"
			/>
			<button
				type="button"
				onClick={onResolve}
				className="btn btn-primary btn-sm"
			>
				Resolve
			</button>
		</div>
	);
}
