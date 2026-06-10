// Typed failures of the local KYC tier + the worker-boundary error codec.
// postMessage cannot carry Error subclasses, so the worker encodes errors as
// "CODE|message" strings and the client decodes them back into typed errors.

/** Same condition as backend customers/errors.py DuplicateCustomerReferenceError. */
export class DuplicateReferenceError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "DuplicateReferenceError";
	}
}

/** A referenced customer or match row does not exist. */
export class NotFoundError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "NotFoundError";
	}
}

/** Resolution failed the API regex ^(FALSE_POSITIVE|TRUE_POSITIVE|RESOLVED)$. */
export class InvalidResolutionError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "InvalidResolutionError";
	}
}

// Codes are reserved prefixes: a plain error message must not itself start with "SOMECODE|" or it will be mis-decoded into a typed error.
const CODES: ReadonlyArray<
	readonly [string, (message: string) => Error, (error: unknown) => boolean]
> = [
	[
		"DUPLICATE_REFERENCE",
		(m) => new DuplicateReferenceError(m),
		(e) => e instanceof DuplicateReferenceError,
	],
	["NOT_FOUND", (m) => new NotFoundError(m), (e) => e instanceof NotFoundError],
	[
		"INVALID_RESOLUTION",
		(m) => new InvalidResolutionError(m),
		(e) => e instanceof InvalidResolutionError,
	],
];

/** Encode an error for the worker→main postMessage boundary. */
export function encodeWorkerError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const match = CODES.find(([, , isMatch]) => isMatch(error));
	return match === undefined ? message : `${match[0]}|${message}`;
}

/** Decode a worker error string back into the typed error it encodes. */
export function decodeWorkerError(encoded: string): Error {
	const sep = encoded.indexOf("|");
	if (sep === -1) {
		return new Error(encoded);
	}
	const match = CODES.find(([code]) => code === encoded.slice(0, sep));
	return match === undefined
		? new Error(encoded)
		: match[1](encoded.slice(sep + 1));
}
