---
name: Bug report
about: Report a reproducible problem in aml-filter
title: "[Bug] "
labels: bug
assignees: ""
---

**Describe the bug**
A clear and concise description of what the bug is.

**To reproduce**
Steps that trigger it — e.g. the in-browser flow (route → action → result):

```
# e.g. /screen → type "Robert Smith" → match card shows the wrong score
# or: pnpm --filter @amlfilter/publisher run build-demo-multilist
```

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened (include the full error and a copy of the browser console).

**Environment**
- aml-filter version (the git tag / commit, or `package.json` version):
- Browser + version (note: a secure context / HTTPS or localhost is required for WebCrypto + OPFS):
- OS:
- Where it ran (the deployed site, local `dev`, or the production `build` + `preview`):

**Additional context**
Anything else that helps — `VITE_`-prefixed env vars, which lists were enabled in
Settings, sample customer/query, screenshots.

> ⚠️ For **security vulnerabilities**, do NOT file a public issue — see [SECURITY.md](../../SECURITY.md).
