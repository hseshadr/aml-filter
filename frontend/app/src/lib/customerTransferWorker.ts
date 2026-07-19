import { readCustomerImportBuffer } from "./customerTransfer";

interface ImportRequest {
	readonly buffer: ArrayBuffer;
	readonly fileName: string;
}

const scope = self as unknown as {
	postMessage(message: unknown): void;
	addEventListener(
		type: "message",
		listener: (event: MessageEvent<ImportRequest>) => void,
	): void;
};

scope.addEventListener("message", (event) => {
	void readCustomerImportBuffer(event.data.buffer, event.data.fileName).then(
		(result) => scope.postMessage(result),
		(error: unknown) =>
			scope.postMessage({
				error: error instanceof Error ? error.message : String(error),
			}),
	);
});
