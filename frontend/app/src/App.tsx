import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import WorkstationGate from "./components/WorkstationGate";
import { LandingPage } from "./pages/LandingPage";
import { ScreenPage } from "./pages/ScreenPage";

// Public routes (/, /screen) stay eager: / is the marketing landing (first
// paint for every visitor) and /screen is the headline demo that boots the
// embedder worker on first paint. The LOCAL-FIRST workstation pages are
// lazy-loaded per-route chunks fetched only on entry — no login, no API key:
// the WorkstationGate opens the in-tab SQLite/OPFS store instead.
//
// Server-tier pages (LoginPage, SearchPage, ApiKeysPage, ListsPage,
// UsagePage, WhitelistPage, SarsPage, SarFormPage, AttestationsPage) and the
// ApiClient remain in the repo for SaaS deployments but are NOT routed in the
// local-first app (spec D3 + §9.2) — no dead UI behind a login with nothing
// to log into. The auth subtree (AuthContext, ProtectedRoute, LoginPage) is
// likewise intentionally kept-but-unreachable, retained for a future SaaS
// mode.
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ReviewBoardPage = lazy(() => import("./pages/ReviewBoardPage"));

function RouteFallback() {
	return (
		<div className="page-loading" role="status" aria-live="polite">
			Loading…
		</div>
	);
}

function App() {
	return (
		<ErrorBoundary>
			<BrowserRouter>
				<Layout>
					<Suspense fallback={<RouteFallback />}>
						<Routes>
							{/* Public, backend-free in-browser OFAC screening tier. */}
							<Route path="/screen" element={<ScreenPage />} />
							{/* Public marketing landing — the front door (PR #21 preserved). */}
							<Route path="/" element={<LandingPage />} />
							<Route
								path="/customers"
								element={
									<WorkstationGate>
										<CustomersPage />
									</WorkstationGate>
								}
							/>
							<Route
								path="/review"
								element={
									<WorkstationGate>
										<ReviewBoardPage />
									</WorkstationGate>
								}
							/>
						</Routes>
					</Suspense>
				</Layout>
			</BrowserRouter>
		</ErrorBoundary>
	);
}

export default App;
