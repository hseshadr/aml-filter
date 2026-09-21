/** @deprecated Bundle storage failures now cross the Worker boundary as
 * `EngineOperationError` with `code === "storage"`. Retained for source
 * compatibility with callers constructing this legacy AML error directly. */
export class QuotaError extends Error {
	public constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "QuotaError";
	}
}
