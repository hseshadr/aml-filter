import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import "../styles/common.css";

interface LayoutProps {
	children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
	const { t } = useTranslation("common");
	return (
		<div className="page-container">
			<header className="nav-header">
				<nav className="nav-container">
					<div className="nav-links">
						<Link to="/" className="nav-brand">
							<img
								src="/logo.svg"
								alt={t("nav.brandAlt")}
								style={{ height: "32px", width: "32px" }}
							/>
							{t("nav.brand")}
						</Link>
						<Link to="/screen" className="nav-link">
							{t("nav.screen")}
						</Link>
						{/* The local-first workstation — no login, no API keys. */}
						<Link to="/customers" className="nav-link">
							{t("nav.customers")}
						</Link>
						<Link to="/review" className="nav-link">
							{t("nav.review")}
						</Link>
						<Link to="/settings" className="nav-link">
							{t("nav.settings")}
						</Link>
					</div>
				</nav>
			</header>
			<main className="page-main">{children}</main>
			<footer className="page-footer">
				<small>{t("layoutFooter")}</small>
			</footer>
		</div>
	);
}
