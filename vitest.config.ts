import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: "file:./prisma/dev.db",
      SESSION_SECRET: "vitest-session-secret",
    },
  },
});
