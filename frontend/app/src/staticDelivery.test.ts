import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(import.meta.dirname, "..");
const PUBLIC_ROOT = join(APP_ROOT, "public");
const ORIGIN = "https://aml-filter.com";

function readAppFile(relativePath: string): string {
	return readFileSync(join(APP_ROOT, relativePath), "utf8");
}

function readPublicFile(relativePath: string): string {
	return readFileSync(join(PUBLIC_ROOT, relativePath), "utf8");
}

function parseHtml(relativePath: string): Document {
	return new DOMParser().parseFromString(
		readAppFile(relativePath),
		"text/html",
	);
}

function metaContent(document: Document, selector: string): string | null {
	return document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

describe("static discovery artifacts", () => {
	test("the root document is crawlable before React boots", () => {
		const document = parseHtml("index.html");

		expect(document.title).toBe(
			"AML-Filter | In-Browser Sanctions Screening Demo",
		);
		expect(metaContent(document, 'meta[name="description"]')).toContain(
			"in-browser sanctions screening",
		);
		expect(
			document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
		).toBe(`${ORIGIN}/`);
		expect(document.querySelector("h1")?.textContent).toContain("AML-Filter");
		expect(
			document.querySelector("#root")?.textContent?.replace(/\s+/g, " "),
		).toContain("not a compliance product");
	});

	test("the root document publishes Open Graph, Twitter, and JSON-LD metadata", () => {
		const document = parseHtml("index.html");

		expect(metaContent(document, 'meta[property="og:title"]')).toContain(
			"AML-Filter",
		);
		expect(
			metaContent(document, 'meta[property="og:description"]'),
		).toBeTruthy();
		expect(metaContent(document, 'meta[property="og:url"]')).toBe(`${ORIGIN}/`);
		expect(metaContent(document, 'meta[name="twitter:card"]')).toBe("summary");
		expect(metaContent(document, 'meta[name="twitter:title"]')).toContain(
			"AML-Filter",
		);

		const schema = document.querySelector(
			'script[type="application/ld+json"]',
		)?.textContent;
		expect(schema).toBeTruthy();
		expect(JSON.parse(schema ?? "{}")).toMatchObject({
			"@context": "https://schema.org",
			"@type": "WebApplication",
			name: "AML-Filter",
			url: `${ORIGIN}/`,
			applicationCategory: "BusinessApplication",
		});
	});

	test("robots.txt permits search and AI crawlers and advertises the sitemap", () => {
		const robots = readPublicFile("robots.txt");

		expect(robots).toContain("User-agent: *\nAllow: /");
		expect(robots).toContain("User-agent: OAI-SearchBot\nAllow: /");
		expect(robots).toContain("User-agent: Claude-SearchBot\nAllow: /");
		expect(robots).toContain("User-agent: PerplexityBot\nAllow: /");
		expect(robots).not.toContain("Disallow: /");
		expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
	});

	test("sitemap.xml contains only canonical public discovery routes", () => {
		const sitemap = new DOMParser().parseFromString(
			readPublicFile("sitemap.xml"),
			"application/xml",
		);
		const locations = [...sitemap.querySelectorAll("url > loc")].map(
			(node) => node.textContent,
		);

		expect(sitemap.querySelector("parsererror")).toBeNull();
		expect(locations).toEqual([`${ORIGIN}/`, `${ORIGIN}/screen`]);
	});

	test("llms.txt is concise, factual, linked, and carries the product disclaimer", () => {
		const llms = readPublicFile("llms.txt");

		expect(llms).toContain("# AML-Filter");
		expect(llms).toContain(`[Screen a name](${ORIGIN}/screen)`);
		expect(llms).toContain("https://github.com/hseshadr/aml-filter");
		expect(llms).toContain("not a compliance product");
		expect(llms.split("\n").length).toBeLessThan(40);
	});
});

describe("route delivery contract", () => {
	test.each([
		["index.html", `${ORIGIN}/`],
		["screen.html", `${ORIGIN}/screen`],
	])("%s is self-canonical and indexable", (file, canonical) => {
		const document = parseHtml(file);

		expect(
			document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
		).toBe(canonical);
		expect(metaContent(document, 'meta[name="robots"]')).toBe("index, follow");
		expect(document.querySelector("h1")).not.toBeNull();
	});

	test.each([
		"customers.html",
		"review.html",
		"settings.html",
	])("%s keeps workstation state out of search results", (file) => {
		const document = parseHtml(file);

		expect(metaContent(document, 'meta[name="robots"]')).toBe(
			"noindex, nofollow",
		);
		expect(document.querySelector('link[rel="canonical"]')).toBeNull();
	});

	test("Cloudflare Pages has explicit route normalization and no SPA catch-all", () => {
		const redirects = readPublicFile("_redirects");

		expect(redirects).toContain("/screen/ /screen 301");
		expect(redirects).toContain("/customers/ /customers 301");
		expect(redirects).not.toMatch(/^\/\*\s+\/index\.html\s+200$/m);
	});

	test("a top-level noindex 404 document opts out of implicit SPA fallback", () => {
		const document = new DOMParser().parseFromString(
			readPublicFile("404.html"),
			"text/html",
		);

		expect(document.title).toContain("Not Found");
		expect(metaContent(document, 'meta[name="robots"]')).toBe(
			"noindex, nofollow",
		);
		expect(document.querySelector("h1")?.textContent).toContain(
			"Page not found",
		);
	});
});
