// prisma.config.ts disables automatic .env loading — load it explicitly.
// dotenv is a devDependency, so in the production runner image it is absent;
// load .env natively instead and let the platform provide real env vars.
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv/config");
} catch {
  if (existsSync(".env")) process.loadEnvFile?.();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
