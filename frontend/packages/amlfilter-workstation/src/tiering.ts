// Match-strength tiers — RE-EXPORT ONLY.
//
// The implementation moved DOWN into @amlfilter/browser (src/engine/tiering.ts)
// because the browser tier's signed score receipt must stamp a tier alongside
// the score, and the dependency runs workstation -> browser, never the reverse.
// One definition, no copy: this module keeps `./tiering` working for every
// existing workstation consumer (tier_match.ts, the index barrel, and the
// tiering.test.ts / tiering.parity.test.ts golden guards) unchanged.

export { classifyTier, STRONG_TIER_FLOOR } from "@amlfilter/browser";
