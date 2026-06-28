## Summary

<!-- What does this PR change, and why? -->

## Related issue

<!-- e.g. Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Docs only
- [ ] Refactor / internal
- [ ] Other:

## Checklist

- [ ] The gate passes locally from `frontend/`: `pnpm -r run lint`, `pnpm -r run typecheck`, `pnpm -r run test`, `pnpm -r run build`
- [ ] The Playwright e2e lanes pass (`test:e2e:c1`, `test:e2e:kyc`, `test:e2e:bundle` from `frontend/app`)
- [ ] New behavior is covered by tests (incl. the scoring / tiering golden parity tests when those change)
- [ ] Public API / list-format / route changes are reflected in the README, `docs/`, and CHANGELOG
- [ ] Verification / signature / integrity paths stay **fail-closed** (no weakened trust check)

## Notes for reviewers

<!-- Anything that helps review: tradeoffs, follow-ups, things to look at closely. -->
