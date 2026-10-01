import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { migrateUrl, schemaUrl } from "../tests/db-url";

/** Fresh migrated + seeded e2e schema ("e2e") before the suite starts. */
export default function globalSetup() {
  rmSync("e2e-uploads", { recursive: true, force: true });
  // PGlite leaks prepared statements — clear them before migrate deploy.
  execSync("npx tsx scripts/deallocate.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("e2e"), NODE_ENV: "development" },
    stdio: "inherit",
  });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: migrateUrl("e2e"), NODE_ENV: "development" },
    stdio: "inherit",
  });
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("e2e"), NODE_ENV: "development" },
    stdio: "inherit",
  });
}
