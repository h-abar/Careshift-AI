import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // Separate test DB (prisma/test.db) — reset + re-seeded per run
      // by tests/routes.test.ts beforeAll.
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "vitest-session-secret-minimum-32chars",
    },
  },
});
