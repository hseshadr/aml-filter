import { BrowserRouter, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import ApiKeysPage from "./pages/ApiKeysPage";
import HomePage from "./pages/HomePage";
import ListsPage from "./pages/ListsPage";
import LoginPage from "./pages/LoginPage";
import { ScreenPage } from "./pages/ScreenPage";
import SearchPage from "./pages/SearchPage";
import UsagePage from "./pages/UsagePage";
import WhitelistPage from "./pages/WhitelistPage";

function App() {
	return (
		<ErrorBoundary>
			<AuthProvider>
				<BrowserRouter>
					<Layout>
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
					</Layout>
				</BrowserRouter>
			</AuthProvider>
		</ErrorBoundary>
	);
}

export default App;
