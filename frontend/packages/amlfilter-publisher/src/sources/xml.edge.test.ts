// xml reader edge behavior the fixture-driven adapter tests do not reach:
// self-closing elements (with and without attributes), textOf on a missing or
// empty element, and firstElement on a missing tag.

import { describe, expect, test } from "vitest";
import { elements, firstElement, textOf } from "./xml.ts";

describe("elements", () => {
	test("reads self-closing tags with attributes and an empty inner", () => {
		expect(elements('<a x="1"/>', "a")).toEqual([
			{ attrs: { x: "1" }, inner: "" },
		]);
	});

	test("reads bare self-closing tags without attributes", () => {
		expect(elements("<a/>", "a")).toEqual([{ attrs: {}, inner: "" }]);
	});
});

describe("firstElement / textOf", () => {
	test("firstElement is undefined for a missing tag", () => {
		expect(firstElement("<b>x</b>", "a")).toBeUndefined();
	});

	test("textOf is undefined for a missing tag", () => {
		expect(textOf("<b>x</b>", "a")).toBeUndefined();
	});

	test("textOf is undefined for an empty or whitespace-only element", () => {
		expect(textOf("<a></a>", "a")).toBeUndefined();
		expect(textOf("<a>  </a>", "a")).toBeUndefined();
	});

	test("textOf decodes entities in the element text", () => {
		expect(textOf("<a>Tom &amp; Jerry &lt;3</a>", "a")).toBe("Tom & Jerry <3");
	});
});
