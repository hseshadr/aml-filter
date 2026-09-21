/** The minimal clone-safe error payload shared by AML's model Worker only. */
export interface ErrorPayload {
	readonly error: string;
	readonly errorName: string;
}

export function errorPayload(error: unknown): ErrorPayload {
	const isError = error instanceof Error;
	return {
		error: isError ? error.message : String(error),
		errorName: isError ? error.name : "Error",
	};
}

export function rebuildError(payload: ErrorPayload): Error {
	const error = new Error(payload.error);
	error.name = payload.errorName;
	return error;
}
