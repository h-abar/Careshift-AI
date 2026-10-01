import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { schemaUrl } from "./tests/db-url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // Isolated Postgres schema ("test") — reset + re-seeded per run
      // by tests/routes.test.ts beforeAll.
      DATABASE_URL: schemaUrl("test"),
      SESSION_SECRET: "vitest-session-secret-minimum-32chars",
    },
  },
});
