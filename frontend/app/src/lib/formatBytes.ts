/**
 * One byte formatter for every download the UI narrates.
 *
 * There are two of these surfaces — the /screen boot banner and the workstation
 * engine strip — and they used to round bytes independently, one in decimal MB
 * and one in MiB. Both spelled the unit "MB", so the same download could read
 * "5.2 MB" in one place and "5.0 MB" in the other. A rule that lives in two
 * places diverges; this is the single copy.
 *
 * Decimal MB (10^6) is deliberate: it is the unit download sizes are quoted in,
 * and it keeps every size the product states — the bundle line, the model line,
 * the "~70 MB" first-visit note — in one system.
 *
 * Sub-megabyte totals render in KB because the first ticks of a cold sync carry
 * tens of kilobytes, and rounding those to "0 MB" makes a download that is
 * working look stuck at zero.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1_000_000) {
		return `${Math.round(bytes / 1000)} KB`;
	}
	const mb = bytes / 1_000_000;
	return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
