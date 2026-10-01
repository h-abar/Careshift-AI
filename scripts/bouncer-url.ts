/**
 * Local `prisma dev` (PGlite) multiplexes all pooled connections onto ONE
 * backend, so prepared statements (named "s0"…) collide across processes —
 * the classic `42P05: prepared statement "s0" already exists`. Passing
 * pgbouncer=true makes the client use simple unnamed statements, which is
 * safe on real Postgres too (only disables Prisma's statement caching).
 * Used by CLI scripts only — migrate commands keep the clean URL because
 * the schema engine cannot run in pooled mode.
 */
export function bouncerUrl(base: string | undefined): string {
  if (!base) throw new Error("DATABASE_URL is required (see .env.example)");
  const u = new URL(base);
  u.searchParams.set("pgbouncer", "true");
  u.searchParams.set("connection_limit", "1");
  return u.toString();
}
