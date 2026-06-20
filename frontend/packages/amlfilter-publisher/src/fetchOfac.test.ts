import { describe, expect, test } from "vitest";
import { parseSdn } from "./fetchOfac.ts";

// Two synthetic OFAC rows in the real fixed-position CSV shape (12 SDN fields,
// 5 ALT fields, "-0-" sentinel). Asserts the id/name/type/alias mapping that
// fetchOfac does FOR REAL (DOB/country are intentionally left empty — see the
// fetchOfac.ts TODO).
const SDN = [
	'"36","AEROCARIBBEAN AIRLINES","-0- ","CUBA","-0-","-0-","-0-","-0-","-0-","-0-","-0-","-0-"',
	'"7157","AL-NUR, Abdul","individual","SDGT","-0-","-0-","-0-","-0-","-0-","-0-","-0-","DOB 01 Jan 1960"',
].join("\n");

const ALT = [
	'"36","220","aka","AERO-CARIBBEAN","-0-"',
	'"7157","999","aka","Abdul AL NUR","-0-"',
].join("\n");

describe("parseSdn", () => {
	test("maps id, name, type and joins aliases by ent_num", () => {
		const lines = parseSdn(SDN, ALT, "2026-06-19");
		expect(lines).toHaveLength(2);

		const org = lines[0];
		expect(org?.entity_id).toBe("OFAC_SDN:36");
		expect(org?.primary_name).toBe("AEROCARIBBEAN AIRLINES");
		expect(org?.entity_type).toBe("ORGANIZATION");
		expect(org?.aliases).toEqual([{ name: "AERO-CARIBBEAN" }]);
		expect(org?.source_list).toBe("OFAC_SDN");
		expect(org?.list_version).toBe("2026-06-19");

		const person = lines[1];
		expect(person?.entity_type).toBe("PERSON");
		expect(person?.aliases).toEqual([{ name: "Abdul AL NUR" }]);
	});

	test("DOB/country left empty (documented TODO)", () => {
		const [org] = parseSdn(SDN, ALT, "2026-06-19");
		expect(org?.dob).toEqual([]);
		expect(org?.countries).toEqual([]);
	});
});
