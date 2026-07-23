import "@testing-library/jest-dom/vitest";
// Initialize the i18next singleton for the whole unit suite so component specs
// resolve real English copy through useTranslation() (provider-less, per i18n.ts)
// instead of leaking raw keys.
import "../i18n";
// Same-realm `crypto.subtle.digest` rewrap so component specs can drive the
// real Ed25519 install-key / score-receipt path under jsdom (see the file's
// header for the Node-22 cross-realm root cause). Inert outside that exact
// TypeError.
import "./subtleDigestRealm";
