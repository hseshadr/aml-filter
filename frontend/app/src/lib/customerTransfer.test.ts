import { describe, expect, it } from "vitest";
import type { CustomerResponse } from "./api";
import {
	buildCustomerImportPreview,
	type CustomerImportRow,
	createCustomerExportFile,
	customersToSpreadsheetRows,
	parseCustomerImportRows,
	readCustomerImportBuffer,
	readCustomerImportFile,
} from "./customerTransfer";

function customer(overrides: Partial<CustomerResponse> = {}): CustomerResponse {
	return {
		customer_id: "cust-1",
		tenant_id: "local",
		customer_reference: "REF-001",
		name: "Ada Lovelace",
		onboarded_by: "alice",
		country: "GB",
		dob: "1815-12-10",
		onboarding_status: "ACTIVE",
		kyc_risk_rating: "LOW",
		id_documents: [],
		screening_entity_id: null,
		created_at: "2026-07-19T10:00:00Z",
		updated_at: "2026-07-19T10:00:00Z",
		...overrides,
	};
}

describe("customer transfer", () => {
	it("normalizes headers and validates required fields deterministically", () => {
		const result = parseCustomerImportRows([
			{
				"Customer Reference": " ref-001 ",
				Name: "Ada Lovelace",
				"Onboarded By": "alice",
				"Country Code": "gb",
				"Date of Birth": "12/10/1815",
			},
		]);

		expect(result.errors).toEqual([]);
		expect(result.rows).toEqual([
			{
				rowNumber: 2,
				customer_reference: "ref-001",
				name: "Ada Lovelace",
				onboarded_by: "alice",
				country: "GB",
				dob: "1815-12-10",
				id_documents: [],
			},
		]);
	});

	it("reports invalid rows without dropping valid rows", () => {
		const result = parseCustomerImportRows([
			{ customer_reference: "OK-1", name: "Valid Customer" },
			{ customer_reference: "", name: "", country: "US" },
			{ customer_reference: "BAD-DATE", name: "Customer", dob: "tomorrow" },
		]);

		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]?.customer_reference).toBe("OK-1");
		expect(result.errors).toEqual([
			{
				rowNumber: 3,
				field: "customer_reference",
				message: "Reference is required",
			},
			{ rowNumber: 3, field: "name", message: "Name is required" },
			{
				rowNumber: 4,
				field: "dob",
				message: "Date must be YYYY-MM-DD or MM/DD/YYYY",
			},
		]);
	});

	it("skips duplicate references within the file and existing customers", () => {
		const rows: CustomerImportRow[] = [
			{
				rowNumber: 2,
				customer_reference: "NEW-1",
				name: "New One",
				onboarded_by: "local",
				country: "US",
				dob: "",
				id_documents: [],
			},
			{
				rowNumber: 3,
				customer_reference: "ref-001",
				name: "Duplicate",
				onboarded_by: "local",
				country: "US",
				dob: "",
				id_documents: [],
			},
			{
				rowNumber: 4,
				customer_reference: "NEW-1",
				name: "Duplicate In File",
				onboarded_by: "local",
				country: "US",
				dob: "",
				id_documents: [],
			},
		];

		const preview = buildCustomerImportPreview(rows, ["REF-001"]);

		expect(preview.accepted).toEqual([rows[0]]);
		expect(preview.duplicates).toEqual([
			{
				rowNumber: 3,
				customer_reference: "ref-001",
				reason: "Already onboarded",
			},
			{
				rowNumber: 4,
				customer_reference: "NEW-1",
				reason: "Duplicate in file",
			},
		]);
	});

	it("exports a stable, re-importable row shape and escapes formula cells", () => {
		expect(
			customersToSpreadsheetRows([
				customer({ name: '=HYPERLINK("https://evil")' }),
			]),
		).toEqual([
			{
				customer_reference: "REF-001",
				name: '\'=HYPERLINK("https://evil")',
				onboarded_by: "alice",
				country: "GB",
				dob: "1815-12-10",
				id_documents: "[]",
				onboarding_status: "ACTIVE",
				kyc_risk_rating: "LOW",
				created_at: "2026-07-19T10:00:00Z",
				updated_at: "2026-07-19T10:00:00Z",
			},
		]);
	});

	it("round-trips an XLSX export through the same bounded importer", async () => {
		const blob = await createCustomerExportFile([customer()]);
		const file = Object.assign(blob, { name: "customers.xlsx" });
		const result = await readCustomerImportFile(file);

		expect(result.errors).toEqual([]);
		expect(result.rows[0]).toMatchObject({
			customer_reference: "REF-001",
			name: "Ada Lovelace",
			country: "GB",
			dob: "1815-12-10",
		});
	});

	it("reads legacy XLS bytes and rejects unsupported macro extensions", async () => {
		const xlsx = await import("xlsx");
		const sheet = xlsx.utils.json_to_sheet([
			{ customer_reference: "XLS-1", name: "Legacy" },
		]);
		const workbook = xlsx.utils.book_new();
		xlsx.utils.book_append_sheet(workbook, sheet, "Customers");
		const bytes = xlsx.write(workbook, { bookType: "xls", type: "array" });
		const result = await readCustomerImportBuffer(bytes, "customers.xls");

		expect(result.rows[0]?.customer_reference).toBe("XLS-1");
		await expect(
			readCustomerImportBuffer(bytes, "customers.xlsm"),
		).rejects.toThrow(/Macro-enabled/);
	});

	it("fails closed before parsing an oversized input", async () => {
		const bytes = new Uint8Array(10 * 1024 * 1024 + 1);
		await expect(
			readCustomerImportFile(
				Object.assign(new Blob([bytes]), { name: "customers.csv" }),
			),
		).rejects.toThrow(/10 MB safety limit/);
	});

	it("rejects invalid workbook signatures and excessively wide sheets", async () => {
		const invalid = new TextEncoder().encode("not a workbook").buffer;
		await expect(
			readCustomerImportBuffer(invalid, "customers.xlsx"),
		).rejects.toThrow(/XLSX file signature is invalid/);

		const xlsx = await import("xlsx");
		const wideRow: Record<string, string> = {
			customer_reference: "WIDE-1",
			name: "Wide",
		};
		for (let index = 0; index < 63; index += 1) wideRow[`extra_${index}`] = "x";
		const sheet = xlsx.utils.json_to_sheet([wideRow]);
		const workbook = xlsx.utils.book_new();
		xlsx.utils.book_append_sheet(workbook, sheet, "Customers");
		const bytes = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
		await expect(
			readCustomerImportBuffer(bytes, "customers.xlsx"),
		).rejects.toThrow(/64-column safety limit/);
	});
});
