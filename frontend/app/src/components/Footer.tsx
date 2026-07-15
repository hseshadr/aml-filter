/**
 * Small footer for the in-browser search demo. States plainly that this is a
 * portfolio demo for searching the PUBLIC OFAC sanctions list, and credits
 * the data source — so nobody mistakes it for a production compliance tool or
 * unattributed data. Mirrors edge-reco's fictional-demo footer.
 */
import { useTranslation } from "react-i18next";

export function Footer() {
	const { t } = useTranslation("common");
	return (
		<footer className="screen-footer">
			<p className="screen-footer__line">{t("demoFooter.line1")}</p>
			<p className="screen-footer__line screen-footer__line--muted">
				{t("demoFooter.line2")}
			</p>
		</footer>
	);
}
