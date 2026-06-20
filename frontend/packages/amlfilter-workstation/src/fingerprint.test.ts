import { describe, expect, it } from "vitest";
import {
	type FingerprintEntity,
	type FingerprintProfile,
	materialFingerprint,
} from "./fingerprint";

const profile: FingerprintProfile = {
	name_canonical: "ivan fakovich",
	country: "RU",
};

const entity: FingerprintEntity = {
	name_canonical: "Ivan Fakovich",
	aliases: ["Vanya Fakovich", "Johnny Fake"],
	dob: ["1971-03-14", "1971-01-01"],
	countries: ["RU", "CA"],
};

describe("materialFingerprint", () => {
	it("is stable across reordered and differently-cased arrays", () => {
		const a = materialFingerprint(profile, entity);
		const reordered: FingerprintEntity = {
			name_canonical: "  IVAN FAKOVICH  ",
			aliases: ["johnny FAKE", " vanya fakovich "],
			dob: ["1971-01-01", "1971-03-14"],
			countries: ["ca", "ru"],
		};
		const b = materialFingerprint(
			{ name_canonical: " IVAN FAKOVICH ", country: " ru " },
			reordered,
		);
		expect(b).toBe(a);
	});

	it("returns a non-empty hex/decimal token", () => {
		expect(materialFingerprint(profile, entity)).toMatch(/^[0-9a-f]+$/);
	});

	it("changes when an alias changes", () => {
		const changed: FingerprintEntity = {
			...entity,
			aliases: ["Vanya Fakovich", "Different Alias"],
		};
		expect(materialFingerprint(profile, changed)).not.toBe(
			materialFingerprint(profile, entity),
		);
	});

	it("changes when a dob changes", () => {
		const changed: FingerprintEntity = { ...entity, dob: ["1980-01-01"] };
		expect(materialFingerprint(profile, changed)).not.toBe(
			materialFingerprint(profile, entity),
		);
	});

	it("changes when a country changes", () => {
		const changed: FingerprintEntity = { ...entity, countries: ["RU", "US"] };
		expect(materialFingerprint(profile, changed)).not.toBe(
			materialFingerprint(profile, entity),
		);
	});

	it("changes when the entity name changes", () => {
		const changed: FingerprintEntity = {
			...entity,
			name_canonical: "Other Person",
		};
		expect(materialFingerprint(profile, changed)).not.toBe(
			materialFingerprint(profile, entity),
		);
	});

	it("changes when the profile name changes", () => {
		expect(
			materialFingerprint(
				{ name_canonical: "someone else", country: "RU" },
				entity,
			),
		).not.toBe(materialFingerprint(profile, entity));
	});

	it("changes when the profile country changes", () => {
		expect(
			materialFingerprint(
				{ name_canonical: "ivan fakovich", country: "US" },
				entity,
			),
		).not.toBe(materialFingerprint(profile, entity));
	});

	it("treats a null profile country and an absent one identically", () => {
		expect(
			materialFingerprint(
				{ name_canonical: "ivan fakovich", country: null },
				entity,
			),
		).toBe(
			materialFingerprint(
				{ name_canonical: "ivan fakovich", country: "" },
				entity,
			),
		);
	});
});
