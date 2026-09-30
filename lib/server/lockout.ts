import { prisma } from "@/lib/server/prisma";
import { trustedProxy } from "@/lib/server/env";

/**
 * DB-backed login lockout — survives restarts, shared across instances.
 * Two independent counters per 15-min window:
 *   1. per-username (any IP)  — stops sprayed attacks across proxies
 *   2. per-username+IP        — stricter local throttle
 */
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MAX_FAILS = 5;

/**
 * Client IP — x-forwarded-for is attacker-controlled unless the app runs
 * behind a trusted proxy, so it is only honoured when TRUSTED_PROXY=1.
 */
export function clientIp(headers: Headers): string {
  if (!trustedProxy()) return "local";
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "local"
  );
}

export async function isLocked(username: string, ip: string) {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const name = username.toLowerCase();
  const [userFails, pairFails] = await Promise.all([
    prisma.loginAttempt.count({
      where: { username: name, success: false, createdAt: { gt: since } },
    }),
    prisma.loginAttempt.count({
      where: {
        username: name,
        ip,
        success: false,
        createdAt: { gt: since },
      },
    }),
  ]);
  return userFails >= LOCKOUT_MAX_FAILS || pairFails >= LOCKOUT_MAX_FAILS;
}

export async function recordAttempt(
  username: string,
  ip: string,
  success: boolean,
) {
  const name = username.toLowerCase();
  await prisma.loginAttempt.create({
    data: { username: name, ip, success },
  });
  // A successful login clears that username's outstanding failures.
  if (success) {
    await prisma.loginAttempt.deleteMany({
      where: { username: name, success: false },
    });
  }
}

/** Admin unlock — clears the window of failed attempts for a username. */
export async function unlockUsername(username: string) {
  const del = await prisma.loginAttempt.deleteMany({
    where: { username: username.toLowerCase(), success: false },
  });
  return del.count;
}
