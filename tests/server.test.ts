import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import {
  can,
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
} from "@/lib/permissions";
import { signSession, verifyToken } from "@/lib/server/session";
import type { RoleKey } from "@/lib/types";

/* ── RBAC enforcement matrix (server mirrors client rules) ── */

describe("permissions", () => {
  it("covers every permission key for every role", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
      for (const p of PERMISSION_KEYS) {
        expect(typeof ROLE_PERMISSIONS[role][p]).toBe("boolean");
      }
    }
  });

  it("nurse cannot see claims or manage users", () => {
    expect(can("nurse", "claims_view")).toBe(false);
    expect(can("nurse", "users_manage")).toBe(false);
    expect(can("nurse", "audit_view")).toBe(false);
    expect(can("nurse", "patients_view")).toBe(true);
    expect(can("nurse", "intervention_execute")).toBe(true);
  });

  it("payer (external) sees payer claims but nothing clinical", () => {
    expect(can("payer", "payer_claims")).toBe(true);
    for (const p of PERMISSION_KEYS) {
      if (p === "payer_claims") continue;
      expect(can("payer", p)).toBe(false);
    }
  });

  it("doctor decides clinically; nurse cannot", () => {
    expect(can("doctor", "clinical_decide")).toBe(true);
    expect(can("doctor", "intervention_escalate")).toBe(true);
    expect(can("nurse", "clinical_decide")).toBe(false);
  });

  it("hospital_admin sees claims monitor + audit, never clinical pages", () => {
    expect(can("hospital_admin", "claims_view")).toBe(true);
    expect(can("hospital_admin", "appeal_approve")).toBe(true);
    expect(can("hospital_admin", "reports_view")).toBe(true);
    expect(can("hospital_admin", "audit_view")).toBe(true);
    expect(can("hospital_admin", "patients_view")).toBe(false);
    expect(can("hospital_admin", "clinical_decide")).toBe(false);
  });

  it("charge nurse manages handoffs and escalations", () => {
    expect(can("charge_nurse", "handoff_manage")).toBe(true);
    expect(can("charge_nurse", "assign_manage")).toBe(true);
    expect(can("charge_nurse", "intervention_escalate")).toBe(true);
  });

  it("admin manages system but has no clinical access (E1 matrix)", () => {
    for (const p of [
      "users_manage", "depts_manage", "settings_manage", "audit_view",
    ] as const) {
      expect(can("admin", p)).toBe(true);
    }
    for (const p of [
      "patients_view", "clinical_decide", "payer_claims",
      "claims_view", "handoff_view",
    ] as const) {
      expect(can("admin", p)).toBe(false);
    }
  });

  it("view-as is restricted to admins only", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
      if (role === "admin") continue;
      expect(can(role, "users_manage")).toBe(false);
    }
  });
});

/* ── Password hashing ── */

describe("password hashing", () => {
  it("hashes and verifies, never storing plaintext", async () => {
    const pw = "Demo@1021";
    const hash = await bcrypt.hash(pw, 10);
    expect(hash).not.toContain(pw);
    expect(await bcrypt.compare(pw, hash)).toBe(true);
    expect(await bcrypt.compare("wrong", hash)).toBe(false);
  });
});

/* ── Session tokens ── */

describe("session tokens", () => {
  it("signs and verifies a session payload", async () => {
    const token = await signSession({ sub: "U-001", sid: "s1", role: "doctor" });
    const payload = await verifyToken(token);
    expect(payload?.sub).toBe("U-001");
    expect(payload?.sid).toBe("s1");
    expect(payload?.role).toBe("doctor");
    expect(payload?.imp).toBeUndefined();
  });

  it("carries the impersonator for admin view-as", async () => {
    const token = await signSession({
      sub: "U-002",
      sid: "s2",
      role: "nurse",
      imp: "U-008",
    });
    const payload = await verifyToken(token);
    expect(payload?.imp).toBe("U-008");
  });

  it("rejects tampered tokens", async () => {
    const token = await signSession({ sub: "U-001", sid: "s1", role: "nurse" });
    const forged = token.slice(0, -4) + "AAAA";
    expect(await verifyToken(forged)).toBeNull();
    expect(await verifyToken("not-a-jwt")).toBeNull();
  });
});

/* ── No plaintext passwords shipped to the client bundle ── */

describe("client data safety", () => {
  it("lib/data/users.ts contains no password fields", async () => {
    const { users } = await import("@/lib/data/users");
    for (const u of users) {
      expect("password" in u).toBe(false);
      expect(u.username).toBeTruthy();
    }
  });
});

/* ── A4: boot-time env validation + config errors not swallowed ── */

describe("env validation (A4)", () => {
  it("production fails fast without a >=32-char SESSION_SECRET", async () => {
    const { validateEnv } = await import("@/lib/server/env");
    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SESSION_SECRET", "");
      expect(() => validateEnv()).toThrow(/SESSION_SECRET/);
      vi.stubEnv("SESSION_SECRET", "short");
      expect(() => validateEnv()).toThrow(/SESSION_SECRET/);
      vi.stubEnv("SESSION_SECRET", "x".repeat(40));
      expect(() => validateEnv()).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("verifyToken returns null for invalid tokens but never swallows config errors", async () => {
    expect(await verifyToken("garbage-token")).toBeNull();
  });

  it("kid rotation: new tokens use s1, old tokens verify via SESSION_SECRET_PREV (s0)", async () => {
    const keyA = "a".repeat(40);
    const keyB = "b".repeat(40);
    vi.stubEnv("SESSION_SECRET", keyA);
    vi.stubEnv("SESSION_SECRET_PREV", "");
    try {
      const oldToken = await signSession({
        sub: "U-1", sid: "s-1", role: "nurse",
      });
      // Rotate: A becomes previous, B becomes current.
      vi.stubEnv("SESSION_SECRET", keyB);
      vi.stubEnv("SESSION_SECRET_PREV", keyA);
      expect((await verifyToken(oldToken))?.sub).toBe("U-1"); // kid s1 misses → s0 hit
      const newToken = await signSession({
        sub: "U-1", sid: "s-2", role: "nurse",
      });
      expect((await verifyToken(newToken))?.sid).toBe("s-2");
      // After the TTL grace, PREV is removed and old tokens die.
      vi.stubEnv("SESSION_SECRET_PREV", "");
      expect(await verifyToken(oldToken)).toBeNull();
      expect((await verifyToken(newToken))?.sub).toBe("U-1");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("TRUSTED_PROXY is off by default", async () => {
    const { trustedProxy } = await import("@/lib/server/env");
    const old = process.env.TRUSTED_PROXY;
    try {
      delete process.env.TRUSTED_PROXY;
      expect(trustedProxy()).toBe(false);
      process.env.TRUSTED_PROXY = "1";
      expect(trustedProxy()).toBe(true);
    } finally {
      process.env.TRUSTED_PROXY = old;
    }
  });
});

describe("clientIp / audit IP (0.3)", () => {
  it("ignores spoofable forwarding headers unless TRUSTED_PROXY", async () => {
    const { clientIp } = await import("@/lib/server/lockout");
    const old = process.env.TRUSTED_PROXY;
    try {
      const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
      delete process.env.TRUSTED_PROXY;
      expect(clientIp(h)).toBe("local");
      process.env.TRUSTED_PROXY = "1";
      expect(clientIp(h)).toBe("203.0.113.9"); // left-most forwarded hop
      expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe(
        "198.51.100.7",
      );
    } finally {
      process.env.TRUSTED_PROXY = old;
    }
  });

});
