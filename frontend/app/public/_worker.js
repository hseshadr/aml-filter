// Cloudflare Pages advanced-mode worker.
// Keep the public hostname canonical without requiring a separate zone rule.
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
		if (hostname === "www.aml-filter.com") {
			url.hostname = "aml-filter.com";
			return Response.redirect(url.toString(), 308);
		}
		if (
			["/screen/", "/customers/", "/review/", "/settings/"].includes(
				url.pathname,
			)
		) {
			url.pathname = url.pathname.slice(0, -1);
			return Response.redirect(url.toString(), 301);
		}
		const asset = await env.ASSETS.fetch(request);
		// The app has no cross-origin data contract. Pages may add a permissive
		// CORS header to static assets, so remove it at the application boundary.
		const headers = new Headers(asset.headers);
		headers.delete("access-control-allow-origin");
		headers.delete("access-control-allow-credentials");
		return new Response(asset.body, {
			status: asset.status,
			statusText: asset.statusText,
			headers,
		});
	},
};
