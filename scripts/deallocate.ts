/**
 * Local `prisma dev` (PGlite) quirk: its single backend leaks prepared
 * statements across pooled connections, so `migrate deploy` can die with
 * `prepared statement "s0" already exists` (42P05) on repeat runs.
 * DEALLOCATE ALL sent through a pgbouncer-mode client clears them.
 * No-op harm on real Postgres (deallocates only this session).
 *   Usage: DATABASE_URL=... npx tsx scripts/deallocate.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

prisma
  .$executeRawUnsafe("DEALLOCATE ALL")
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("deallocate failed:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
