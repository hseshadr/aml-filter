import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import WorkstationGate from "./components/WorkstationGate";
import { LandingPage } from "./pages/LandingPage";
import { ScreenPage } from "./pages/ScreenPage";

// The app is ZERO-SERVER / LOCAL-FIRST: there is no backend, no login, and no
// API key — every route runs entirely in the tab.
//
// Public routes (/, /screen) stay eager: / is the marketing landing (first
// paint for every visitor) and /screen is the headline demo that boots the
// embedder worker on first paint. The workstation pages (/customers, /review)
// are lazy-loaded per-route chunks fetched only on entry and gated by the
// WorkstationGate, which opens the in-tab SQLite/OPFS store (no auth — there
// is nothing to log into).
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ReviewBoardPage = lazy(() => import("./pages/ReviewBoardPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function RouteFallback() {
	const { t } = useTranslation("common");
	return (
		<div className="page-loading" role="status" aria-live="polite">
			{t("route.loading")}
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
							<Route
								path="/settings"
								element={
									<WorkstationGate>
										<SettingsPage />
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
