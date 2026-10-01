import "dotenv/config";

/**
 * Derives a Postgres URL for an isolated test/e2e schema on the SAME
 * server as dev — `?schema=` sets the Postgres search_path, and Prisma
 * migrate creates the schema on deploy. Keeps one DB server sufficient
 * for dev + vitest + e2e.
 */
function url(name: string, migrate = false): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is required (see .env.example)");
  const u = new URL(base);
  u.searchParams.set("schema", name);
  if (!migrate) {
    // Local `prisma dev` (PGlite) multiplexes pooled connections onto one
    // backend — prepared statements collide (42P05). pgbouncer mode makes
    // Prisma skip them. Harmless on real Postgres too — but Prisma MIGRATE
    // cannot run in pooled mode, so migrateUrl() omits it.
    u.searchParams.set("pgbouncer", "true");
    u.searchParams.set("connection_limit", "1");
  }
  return u.toString();
}

export function schemaUrl(name: string): string {
  return url(name, false);
}

export function migrateUrl(name: string): string {
  return url(name, true);
}
