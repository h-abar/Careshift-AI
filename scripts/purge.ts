/**
 * Retention purge runner (item 7). Usage:
 *   npm run db:purge
 * Schedule via cron / Task Scheduler. Retention windows come from
 * RETENTION_*_DAYS env vars (see .env.example); the run writes a
 * `system.purge` audit row with per-table counts.
 */
import "dotenv/config";
import { purgeExpired } from "../lib/server/retention";
import { prisma } from "../lib/server/prisma";

purgeExpired()
  .then(async (r) => {
    console.log("purge complete:", JSON.stringify(r));
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("purge failed:", err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
