import { prisma } from "@/lib/server/prisma";
import { handle } from "@/lib/server/json";

/**
 * Readiness (item 8) — DB reachable AND no failed/partial migrations.
 * Unauthenticated but deliberately shallow: returns only status fields,
 * never connection details. 503 when not ready so orchestrators hold traffic.
 */
export const GET = handle(async (_req: Request) => {
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
    // A5 — terminology/API cache freshness per provider (ISO or null).
    const [termRows, cacheRows] = await Promise.all([
      prisma.terminology.groupBy({ by: ["provider"], _max: { fetchedAt: true } }),
      prisma.extCache.groupBy({ by: ["provider"], _max: { fetchedAt: true } }),
    ]);
    const cache: Record<string, string | null> = {};
    for (const r of [...termRows, ...cacheRows]) {
      const at = r._max.fetchedAt;
      if (!at) continue;
      const prev = cache[r.provider];
      if (!prev || at.toISOString() > prev) cache[r.provider] = at.toISOString();
    }
    return Response.json({ status: "ready", db: "up", migrations: "applied", cache });
  } catch {
    return Response.json(
      { status: "not_ready", db: "down" },
      { status: 503 },
    );
  }
});
