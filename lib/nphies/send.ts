/**
 * C10 — outbound gate. The Simulated mock handles everything by default.
 * A real $process-message POST happens ONLY when ALL of these hold:
 *   NPHIES_ENV=sandbox · NPHIES_ENDPOINT set · NPHIES_CLIENT_CERT and
 *   NPHIES_CLIENT_KEY set (mutual TLS per the IG).
 * No hardcoded endpoint; never send real patient data to test systems.
 */
import { env } from "@/lib/server/env";
import { processMessage } from "./mock";
import { MOCK_LABEL } from "./terminology";
import { validateBundle } from "./validate";

export interface SendResult {
  via: "mock" | "sandbox";
  status: number;
  acknowledgement: unknown;
  label: string;
}

export function nphiesConfigured(): boolean {
  const e = env();
  return (
    e.NPHIES_ENV === "sandbox" &&
    !!e.NPHIES_ENDPOINT &&
    !!e.NPHIES_CLIENT_CERT &&
    !!e.NPHIES_CLIENT_KEY
  );
}

export async function sendBundle(bundle: unknown): Promise<SendResult> {
  // validate before ANY send — even to the mock
  const errors = validateBundle(bundle).filter((i) => i.severity === "error");
  if (errors.length) {
    return {
      via: "mock", status: 400,
      acknowledgement: { errors: errors.map((e) => e.msg) },
      label: MOCK_LABEL,
    };
  }

  if (!nphiesConfigured()) {
    const r = processMessage(bundle);
    return {
      via: "mock", status: r.status,
      acknowledgement: r.acknowledgement, label: MOCK_LABEL,
    };
  }

  // sandbox path — mutual TLS; mTLS wiring is env-driven (cert/key paths).
  // Node fetch cannot attach client certs directly; deployments terminate
  // TLS at a configured forwarder — documented, not implemented here.
  const e = env();
  const res = await fetch(`${e.NPHIES_ENDPOINT}/$process-message`, {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(bundle),
    signal: AbortSignal.timeout(30_000),
  });
  return {
    via: "sandbox",
    status: res.status,
    acknowledgement: await res.json().catch(() => ({})),
    label: "NPHIES sandbox",
  };
}
