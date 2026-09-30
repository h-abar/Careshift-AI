/**
 * Canonical claim denial reason codes — rendered via i18n `deny.*` keys so
 * the stored code is language-neutral.
 */
export const DENIAL_CODES = [
  "missing_docs",
  "medical_necessity",
  "coding_error",
  "duplicate",
  "coverage_excluded",
  "timely_filing",
] as const;

export type DenialCode = (typeof DENIAL_CODES)[number];

export const isDenialCode = (v: unknown): v is DenialCode =>
  typeof v === "string" && (DENIAL_CODES as readonly string[]).includes(v);

/* ── Claim document upload policy ── */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const UPLOAD_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};
