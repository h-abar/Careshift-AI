import { prisma } from "@/lib/server/prisma";
import { handle } from "@/lib/server/json";

/**
 * Readiness (item 8) — DB reachable AND no failed/partial migrations.
 * Unauthenticated but deliberately shallow: returns only status fields,
 * never connection details. 503 when not ready so orchestrators hold traffic.
 */
export const GET = handle(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const pending = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM _prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
    const failed = Number(pending[0]?.n ?? 0);
    if (failed > 0) {
      return Response.json(
        { status: "not_ready", db: "up", migrations: "incomplete" },
        { status: 503 },
      );
    }
    return Response.json({ status: "ready", db: "up", migrations: "applied" });
  } catch {
    return Response.json(
      { status: "not_ready", db: "down" },
      { status: 503 },
    );
  }
});
