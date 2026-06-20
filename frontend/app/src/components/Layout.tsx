import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "../styles/common.css";

interface LayoutProps {
	children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
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
						{/* The local-first workstation — no login, no API keys. */}
						<Link to="/customers" className="nav-link">
							Customers
						</Link>
						<Link to="/review" className="nav-link">
							Review
						</Link>
						<Link to="/settings" className="nav-link">
							Settings
						</Link>
					</div>
				</nav>
			</header>
			<main className="page-main">{children}</main>
			<footer className="page-footer">
				<small>AML-Filter v2 - Open Source AML Screening Engine</small>
			</footer>
		</div>
	);
}
