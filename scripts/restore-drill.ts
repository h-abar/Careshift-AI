/**
 * Restore drill (item 11) — a pg_dump-free logical drill that runs
 * anywhere Prisma does (including local `prisma dev`/PGlite where pg_dump
 * isn't installed). NOT the production backup path — production uses
 * scripts/backup.sh + restore.sh (pg_dump/pg_restore).
 *
 *   DATABASE_URL=<source> DRILL_SCHEMA=drill_<ts> npx tsx scripts/restore-drill.ts
 *
 * Steps: dump every table to backups/drill-<ts>.json → create a fresh
 * schema → migrate deploy → insert rows (FK-ordered) → count-verify.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Parents before children (FK order).
const TABLES = [
  "role", "user", "session", "patient", "shift", "assignment",
  "notification", "notificationReceipt", "shiftHandoff", "handoff",
  "handoffPatient", "handoffEvent", "riskAssessment", "insuranceClaim",
  "claimDocument", "claimEvent", "interventionOverride", "journeyEvent",
  "auditLog", "loginAttempt", "rateBucket",
] as const;

// pgbouncer-mode client for the source dump + housekeeping statements —
// PGlite leaks prepared statements across pooled connections otherwise.
const src = new PrismaClient({
  datasourceUrl: (() => {
    const u = new URL(process.env.DATABASE_URL!);
    u.searchParams.set("pgbouncer", "true");
    u.searchParams.set("connection_limit", "1");
    return u.toString();
  })(),
});
const drillSchema = `drill_${Date.now().toString(36)}`;

const withSchema = (name: string) => {
  const u = new URL(process.env.DATABASE_URL!);
  u.searchParams.set("schema", name);
  return u.toString();
};

async function main() {
  // 1) dump
  mkdirSync("backups", { recursive: true });
  const file = `backups/drill-${drillSchema}.json`;
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    dump[t] = await (src as any)[t].findMany();
  }
  writeFileSync(file, JSON.stringify(dump));
  const counts = Object.fromEntries(
    Object.entries(dump).map(([k, v]) => [k, v.length]),
  );
  console.log("[drill] dumped →", file, counts);

  // 2) fresh schema + migrate deploy (deallocate first — PGlite leaks
  //    prepared statements and migrate cannot run in pgbouncer mode)
  const dstUrl = withSchema(drillSchema);
  await src.$executeRawUnsafe("DEALLOCATE ALL");
  await src.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${drillSchema}"`);
  console.log("[drill] fresh schema:", drillSchema);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: dstUrl },
    stdio: "inherit",
  });

  // 3) restore
  const dst = new PrismaClient({ datasourceUrl: dstUrl });
  for (const t of TABLES) {
    const rows = dump[t] as any[];
    if (rows.length) await (dst as any)[t].createMany({ data: rows });
  }

  // 4) verify counts
  let ok = true;
  for (const t of TABLES) {
    const want = counts[t] as number;
    const got = await (dst as any)[t].count();
    const mark = got === want ? "OK " : "FAIL";
    if (got !== want) ok = false;
    console.log(`[drill] ${mark} ${t}: ${got}/${want}`);
  }
  await dst.$disconnect();
  await src.$disconnect();

  // leave the schema for inspection; drop it to keep the drill clean
  if (ok) {
    const dropper = new PrismaClient();
    await dropper.$executeRawUnsafe(`DROP SCHEMA "${drillSchema}" CASCADE`);
    await dropper.$disconnect();
    console.log(`[drill] PASS — schema ${drillSchema} dropped`);
  } else {
    console.log(`[drill] FAIL — schema ${drillSchema} kept for inspection`);
    process.exit(1);
  }
}

main();
