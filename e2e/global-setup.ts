import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Fresh migrated + seeded e2e database before the suite starts. */
export default function globalSetup() {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: "file:./e2e.db",
    NODE_ENV: "development" as const,
  };
  rmSync("prisma/e2e.db", { force: true });
  rmSync("e2e-uploads", { recursive: true, force: true });
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}
