import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import { ScreenPage } from "./pages/ScreenPage";

// Public routes (/screen, /login) stay eager: /screen is the headline route and
// intentionally boots the embedder worker on first paint, /login is the small
// first-seen auth form. The auth-protected admin pages are lazy-loaded so a
// keyless /screen visitor never downloads them — they split into per-route
// chunks fetched only after sign-in.
const HomePage = lazy(() => import("./pages/HomePage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const ApiKeysPage = lazy(() => import("./pages/ApiKeysPage"));
const ListsPage = lazy(() => import("./pages/ListsPage"));
const UsagePage = lazy(() => import("./pages/UsagePage"));
const WhitelistPage = lazy(() => import("./pages/WhitelistPage"));

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
								<Route
									path="/"
									element={
										<ProtectedRoute>
											<HomePage />
										</ProtectedRoute>
									}
								/>
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
							</Routes>
						</Suspense>
					</Layout>
				</BrowserRouter>
			</AuthProvider>
		</ErrorBoundary>
	);
}

export default App;
