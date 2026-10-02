import { requireAuth } from "@/lib/server/session";
import { handle, ok } from "@/lib/server/json";
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { CHAIN_ACK_MINUTES, CHAIN_SEEN_MINUTES } from "@/lib/server/chains";
import { LATE_ENTRY_MINUTES } from "@/lib/server/events";
import type { RoleKey } from "@/lib/types";

/**
 * B2 — GET /api/rules/general: operational policies generated from
 * config + RBAC, not hand-typed prose. Numbers come from the same
 * constants/env the runtime enforces.
 */
export const GET = handle(async () => {
  await requireAuth();
  const rl = (k: string, d: number) => Number(process.env[k] ?? d);
  const ret = (k: string, d: number) => Number(process.env[k] ?? d);

  return ok({
    prioritization: {
      // mirrors lib/engines/priority.ts — validated indicators only
      order: ["NEWS2 tier", "NEWS2 score", "shock index >1 / lactate ≥2.5", "sepsis hour-1 bundle overdue"],
      informational: ["nurse concern", "I-PASS severity", "overdue tasks", "stale vitals", "qSOFA"],
      rule: "patient-ordering",
    },
    alerting: {
      tiers: [
        { tier: 3, when: "NEWS2 ≥ 7", action: "emergency escalation" },
        { tier: 2, when: "NEWS2 5–6 or single param = 3", action: "urgent ward response" },
        { tier: 1, when: "NEWS2 1–4", action: "routine monitoring" },
        { tier: 0, when: "NEWS2 0", action: "minimal" },
      ],
      ackMinutes: CHAIN_ACK_MINUTES,
      seenMinutes: CHAIN_SEEN_MINUTES,
      label: "prototype settings",
    },
    handoff: {
      framework: "I-PASS",
      required: ["illness severity (NEWS2 tier)", "patient summary", "action list", "situation awareness/contingency", "receiver synthesis"],
      escalation: "SBAR",
    },
    data: {
      syntheticLabel: "Simulated",
      datasets: ["MIMIC-IV demo (planned validation)", "synthetic demo seed"],
      freshnessEndpoint: "/api/freshness",
    },
    rbac: {
      roles: Object.keys(ROLE_PERMISSIONS) as RoleKey[],
      permissions: PERMISSION_KEYS,
      matrix: ROLE_PERMISSIONS,
    },
    audit: {
      retentionDays: {
        audit: ret("RETENTION_AUDIT_DAYS", 365),
        login: ret("RETENTION_LOGIN_DAYS", 90),
        session: ret("RETENTION_SESSION_DAYS", 30),
        notification: ret("RETENTION_NOTIFICATION_DAYS", 90),
        document: ret("RETENTION_DOCUMENT_DAYS", 365),
        rateBucket: ret("RETENTION_RATEBUCKET_DAYS", 7),
      },
      rateLimits: {
        login: rl("RL_LOGIN", 20),
        userAdmin: rl("RL_USERADMIN", 30),
        upload: rl("RL_UPLOAD", 30),
        reassess: rl("RL_REASSESS", 12),
        claimWrite: rl("RL_CLAIMWRITE", 60),
      },
      lateEntryMinutes: LATE_ENTRY_MINUTES,
    },
  });
});
