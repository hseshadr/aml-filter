import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import { LandingPage } from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import { ScreenPage } from "./pages/ScreenPage";

// Public routes (/, /screen, /login) stay eager: / is the marketing landing
// (first paint for every visitor), /screen is the headline demo that
// intentionally boots the embedder worker on first paint, and /login is the
// small first-seen auth form. The auth-protected admin pages are lazy-loaded so
// a keyless visitor never downloads them — they split into per-route chunks
// fetched only after sign-in.
const SearchPage = lazy(() => import("./pages/SearchPage"));
const ApiKeysPage = lazy(() => import("./pages/ApiKeysPage"));
const ListsPage = lazy(() => import("./pages/ListsPage"));
const UsagePage = lazy(() => import("./pages/UsagePage"));
const WhitelistPage = lazy(() => import("./pages/WhitelistPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ReviewBoardPage = lazy(() => import("./pages/ReviewBoardPage"));
const SarsPage = lazy(() => import("./pages/SarsPage"));
const SarFormPage = lazy(() => import("./pages/SarFormPage"));
const AttestationsPage = lazy(() => import("./pages/AttestationsPage"));

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
			<AuthProvider>
				<BrowserRouter>
					<Layout>
						<Suspense fallback={<RouteFallback />}>
							<Routes>
								<Route path="/login" element={<LoginPage />} />
								{/* Public, backend-free in-browser OFAC screening tier. */}
								<Route path="/screen" element={<ScreenPage />} />
								{/* Public marketing landing — the front door for every visitor. */}
								<Route path="/" element={<LandingPage />} />
								<Route
									path="/search"
									element={
										<ProtectedRoute>
											<SearchPage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/api-keys"
									element={
										<ProtectedRoute>
											<ApiKeysPage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/lists"
									element={
										<ProtectedRoute>
											<ListsPage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/usage"
									element={
										<ProtectedRoute>
											<UsagePage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/whitelist"
									element={
										<ProtectedRoute>
											<WhitelistPage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/customers"
									element={
										<ProtectedRoute>
											<CustomersPage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/review"
									element={
										<ProtectedRoute>
											<ReviewBoardPage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/sars"
									element={
										<ProtectedRoute>
											<SarsPage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/sars/new"
									element={
										<ProtectedRoute>
											<SarFormPage />
										</ProtectedRoute>
									}
								/>
								<Route
									path="/attestations"
									element={
										<ProtectedRoute>
											<AttestationsPage />
										</ProtectedRoute>
									}
								/>
							</Routes>
						</Suspense>
					</Layout>
				</BrowserRouter>
			</AuthProvider>
		</ErrorBoundary>
	);
}

export default App;
