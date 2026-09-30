import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { can, type PermKey } from "@/lib/permissions";
import type { User } from "@/lib/types";

/**
 * Session layer — signed JWT in an httpOnly cookie + a DB Session row
 * (revocation + audit trail). Structured so an SSO/Keycloak provider can
 * later issue the same session after an OIDC exchange.
 */
export const SESSION_COOKIE = "cs_session";
const TTL_MS = 8 * 60 * 60 * 1000; // 8h

/**
 * Session signing key — no hard-coded fallback.
 * Production: SESSION_SECRET is mandatory (≥32 chars) or startup throws.
 * Dev: a fixed dev key is used with a loud warning so sign/verify stay
 * stable across restarts without a .env.
 */
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET is missing or shorter than 32 chars — set it in the environment before starting Careshift AI.",
      );
    }
    console.warn(
      "[SECURITY] SESSION_SECRET is missing/short — using an insecure dev key. DO NOT deploy like this.",
    );
    return new TextEncoder().encode("careshift-INSECURE-dev-key-000");
  }
  return new TextEncoder().encode(s);
};

export interface SessionPayload {
  sub: string; // user id
  sid: string; // session row id
  role: User["role"];
  imp?: string; // impersonator user id (admin view-as)
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ sid: p.sid, role: p.role, imp: p.imp })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + TTL_MS))
    .sign(secret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  // Resolve the key OUTSIDE the try — a missing/weak SESSION_SECRET is a
  // configuration error and must propagate, not be swallowed as "bad token".
  const key = secret();
  try {
    const { payload } = await jwtVerify(token, key);
    return {
      sub: payload.sub as string,
      sid: payload.sid as string,
      role: payload.role as User["role"],
      imp: payload.imp as string | undefined,
    };
  } catch {
    return null;
  }
}

export interface AuthContext {
  user: Omit<User, "password">;
  sid: string;
  impersonator?: Omit<User, "password">;
}

function toSessionUser(r: {
  id: string; username: string; nameEn: string; nameAr: string;
  roleKey: string; dept: string; specialtyEn: string; specialtyAr: string;
  email: string; phone: string; employeeId: string; status: string;
  lastLoginAt: Date | null; createdAt: Date;
}): Omit<User, "password"> {
  return {
    id: r.id, username: r.username, nameEn: r.nameEn, nameAr: r.nameAr,
    role: r.roleKey as User["role"], dept: r.dept,
    specialty: { en: r.specialtyEn, ar: r.specialtyAr },
    email: r.email, phone: r.phone, employeeId: r.employeeId,
    status: r.status as "active" | "suspended",
    lastLoginMin: r.lastLoginAt
      ? Math.max(0, Math.round((Date.now() - r.lastLoginAt.getTime()) / 60000))
      : null,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  };
}

/** Reads + validates the session cookie, checks the DB session is live. */
export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });

  // A suspended account's sessions are deleted by the admin action, so a
  // stale cookie arrives with NO session row — audit the rejection once
  // here instead of silently 401-ing.
  if (!session || session.expiresAt < new Date()) {
    const u = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (u && u.status !== "active") {
      await audit({
        userId: u.id,
        action: "auth.suspended_reject",
        entityType: "user",
        entityId: u.id,
        sessionId: payload.sid,
      }).catch(() => {});
    }
    return null;
  }

  // Belt and braces — suspended but session row somehow still live.
  if (session.user.status !== "active") {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    await audit(
      {
        userId: session.user.id,
        action: "auth.suspended_reject",
        entityType: "user",
        entityId: session.user.id,
        sessionId: session.id,
      },
    ).catch(() => {});
    return null;
  }

  const user = toSessionUser(session.user);
  let impersonator: Omit<User, "password"> | undefined;
  if (session.impersonatorId) {
    const imp = await prisma.user.findUnique({
      where: { id: session.impersonatorId },
    });
    if (imp) impersonator = toSessionUser(imp);
  }
  return { user, sid: session.id, impersonator };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** requireAuth + requirePerm — the server-side enforcement for every handler. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new ApiError(401, "unauthenticated");
  return auth;
}

export async function requirePerm(perm: PermKey): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!can(auth.user.role, perm)) throw new ApiError(403, "forbidden");
  return auth;
}

/** Any-of permission check — for aggregate endpoints shared across roles. */
export async function requireAnyPerm(perms: PermKey[]): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!perms.some((p) => can(auth.user.role, p))) {
    throw new ApiError(403, "forbidden");
  }
  return auth;
}

export const sessionTtlMs = TTL_MS;
