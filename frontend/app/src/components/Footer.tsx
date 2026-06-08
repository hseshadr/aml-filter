/**
 * Small footer for the in-browser search demo. States plainly that this is a
 * portfolio demo for searching the PUBLIC OFAC sanctions list, and credits
 * the data source — so nobody mistakes it for a production compliance tool or
 * unattributed data. Mirrors edge-reco's fictional-demo footer.
 */
export function Footer() {
	return (
		<footer className="screen-footer">
			<p className="screen-footer__line">
				This is a portfolio demo of{" "}
				<a
					className="screen-footer__link"
					href="https://github.com/hseshadr/aml-filter"
					target="_blank"
					rel="noopener noreferrer"
				>
					aml-filter
				</a>{" "}
				— it lets you search the public OFAC sanctions list entirely in this
				browser tab. No name you type ever leaves your device.
			</p>
			<p className="screen-footer__line screen-footer__line--muted">
				Data: U.S. Treasury OFAC Specially Designated Nationals (SDN) list, a
				public dataset. See the repo&rsquo;s NOTICE for attribution. Not legal
				or compliance advice.
			</p>
		</footer>
	);
}
