// Parse `entities.jsonl` (one JSON Entity per line) into an id-keyed lookup —
// the in-memory entity metadata the screen joins onto vector candidates,
// mirroring the backend's `entities_by_id` map (aml_filter.bundle.sync).

import type { Entity } from "./domain";

const DECODER = new TextDecoder();

/** Parse entities.jsonl bytes into a Map keyed by entity_id. */
export function parseEntities(bytes: Uint8Array): ReadonlyMap<string, Entity> {
	const map = new Map<string, Entity>();
	for (const line of DECODER.decode(bytes).split("\n")) {
		if (line.trim().length === 0) {
			continue;
		}
		const entity = JSON.parse(line) as Entity;
		map.set(entity.entity_id, entity);
	}
	return map;
}
