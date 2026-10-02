/**
 * B3 — versioned Terms of Use.
 * Bump TERMS_VERSION whenever the section text changes; users whose
 * `User.termsVersion` differs are re-prompted to accept on next login.
 * Section bodies live in lib/i18n/{en,ar}.ts under `terms.s<key>*`.
 */
export const TERMS_VERSION = "2026-01-01.v1";

/** Ordered section keys — each maps to i18n key `terms.s.<key>`. */
export const TERMS_SECTIONS = [
  "purpose",
  "clinical",
  "data",
  "privacy",
  "thirdparty",
  "liability",
  "acceptable",
  "contact",
] as const;

export type TermsSectionKey = (typeof TERMS_SECTIONS)[number];
