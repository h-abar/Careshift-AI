import { trustedProxy } from "@/lib/server/env";

/**
 * 0.6 — Pluggable CAPTCHA verifier (DoS mitigation).
 * A sprayed per-username lock would otherwise deny a known user indefinitely;
 * when a verifier is configured the username-wide lock degrades to a CAPTCHA
 * challenge instead of a hard 429, so the real user can still get in.
 * The tighter per-username+IP lock is NEVER bypassed.
 * Trade-off: an attacker who can also solve CAPTCHAs keeps trying — the
 * per-username+IP lock and progressive Retry-After still bound the spray.
 */
export interface CaptchaVerifier {
  name: string;
  verify(token: string, ip: string): Promise<boolean>;
}

/** Cloudflare Turnstile adapter — CAPTCHA_PROVIDER=turnstile + CAPTCHA_SECRET. */
class TurnstileVerifier implements CaptchaVerifier {
  name = "turnstile";
  constructor(private secret: string) {}
  async verify(token: string, ip: string) {
    try {
      const res = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            secret: this.secret,
            response: token,
            remoteip: trustedProxy() ? ip : undefined,
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      return ((await res.json()) as { success?: boolean }).success === true;
    } catch {
      return false;
    }
  }
}

let override: CaptchaVerifier | null | undefined;

export function captchaVerifier(): CaptchaVerifier | null {
  if (override !== undefined) return override;
  if (process.env.CAPTCHA_PROVIDER === "turnstile" && process.env.CAPTCHA_SECRET)
    return new TurnstileVerifier(process.env.CAPTCHA_SECRET);
  return null;
}

/** Test hook — pass null to simulate "configured but always fails". */
export function __setCaptchaVerifierForTests(v: CaptchaVerifier | null | undefined) {
  override = v;
}
