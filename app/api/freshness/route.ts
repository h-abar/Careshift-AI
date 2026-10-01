import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

/**
 * GET /api/freshness — public, read-only. Latest terminology/cache fetch
 * date per external provider, plus the oldest (the UI's "data as of").
 */
export async function GET() {
  const [termRows, cacheRows] = await Promise.all([
    prisma.terminology.groupBy({ by: ["provider"], _max: { fetchedAt: true } }),
    prisma.extCache.groupBy({ by: ["provider"], _max: { fetchedAt: true } }),
  ]);
  const providers: Record<string, string | null> = {};
  let oldest: Date | null = null;
  for (const r of [...termRows, ...cacheRows]) {
    const at = r._max.fetchedAt;
    if (!at) continue;
    const prev = providers[r.provider];
    providers[r.provider] =
      !prev || at.toISOString() > prev ? at.toISOString() : prev;
    if (!oldest || at < oldest) oldest = at;
  }
  return NextResponse.json({
    asOf: oldest ? oldest.toISOString().slice(0, 10) : null,
    providers,
  });
}
