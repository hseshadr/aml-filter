import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/common.css";

interface LayoutProps {
	children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
	const { isAuthenticated, logout } = useAuth();
	const navigate = useNavigate();

	const handleLogout = () => {
		logout();
		navigate("/login");
	};

	return (
		<div className="page-container">
			<header className="nav-header">
				<nav className="nav-container">
					<div className="nav-links">
						<Link to="/" className="nav-brand">
							<img
								src="/logo.svg"
								alt="AML-Filter"
								style={{ height: "32px", width: "32px" }}
							/>
							AML-Filter v2
						</Link>
						<Link to="/screen" className="nav-link">
							Screen (in-browser)
						</Link>
						{isAuthenticated && (
							<>
								<Link to="/search" className="nav-link">
									Search
								</Link>
								<Link to="/customers" className="nav-link">
									Customers
								</Link>
								<Link to="/whitelist" className="nav-link">
									Whitelist
								</Link>
								<Link to="/lists" className="nav-link">
									Lists
								</Link>
								<Link to="/usage" className="nav-link">
									Usage
								</Link>
								<Link to="/api-keys" className="nav-link">
									API Keys
								</Link>
							</>
						)}
					</div>
					{isAuthenticated && (
						<button
							type="button"
							onClick={handleLogout}
							className="btn btn-danger"
						>
							Logout
						</button>
					)}
				</nav>
			</header>
			<main className="page-main">{children}</main>
			<footer className="page-footer">
				<small>AML-Filter v2 - Open Source AML Screening Engine</small>
			</footer>
		</div>
	);
}
