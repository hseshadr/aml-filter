import "@testing-library/jest-dom/vitest";
// Initialize the i18next singleton for the whole unit suite so component specs
// resolve real English copy through useTranslation() (provider-less, per i18n.ts)
// instead of leaking raw keys.
import "../i18n";
