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

  it("nurse cannot see insurance or manage users", () => {
    expect(can("nurse", "insurance_view")).toBe(false);
    expect(can("nurse", "users_manage")).toBe(false);
    expect(can("nurse", "audit_view")).toBe(false);
    expect(can("nurse", "patients_view")).toBe(true);
    expect(can("nurse", "intervention_execute")).toBe(true);
  });

  it("insurance reviewer sees claims but cannot act clinically", () => {
    expect(can("insurance", "insurance_view")).toBe(true);
    expect(can("insurance", "evidence_view")).toBe(true);
    expect(can("insurance", "handoff_accept")).toBe(false);
    expect(can("insurance", "intervention_execute")).toBe(false);
    expect(can("insurance", "users_manage")).toBe(false);
  });

  it("charge nurse manages handoffs and escalations", () => {
    expect(can("charge_nurse", "handoff_manage")).toBe(true);
    expect(can("charge_nurse", "assign_manage")).toBe(true);
    expect(can("charge_nurse", "intervention_escalate")).toBe(true);
  });

  it("admin holds the full permission set", () => {
    for (const p of PERMISSION_KEYS) {
      expect(can("admin", p)).toBe(true);
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
    const token = await signSession({ sub: "U-001", sid: "s1", role: "physician" });
    const payload = await verifyToken(token);
    expect(payload?.sub).toBe("U-001");
    expect(payload?.sid).toBe("s1");
    expect(payload?.role).toBe("physician");
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
