import { requireAnyPerm } from "@/lib/server/session";
import { payerWhere } from "@/lib/server/claims";
import { runClaimsPipeline, pipelineStats } from "@/lib/server/claim-pipeline";
import { dbSavingsTrend, toClaim } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { auditOnce, auditDedupeMin } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async (req: Request) => {
  const auth = await requireAnyPerm(["claims_view", "payer_claims"]);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 20),
  );
  // E7 — sweep the auto-pipeline on the read path (idempotent): draft
  // claims submit themselves, fixed exceptions resubmit themselves.
  if (auth.user.role !== "payer") await runClaimsPipeline();
  // E7 — payer orgs only ever list their own claims.
  const where = {
    ...(status ? { status } : {}),
    ...payerWhere(auth),
  };
  const [total, rows, savingsTrend] = await Promise.all([
    prisma.insuranceClaim.count({ where }),
    prisma.insuranceClaim.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    dbSavingsTrend(),
  ]);
  const claims = rows.map(toClaim);
  await auditOnce(
    auth.user.id, "claims.list", "claim", "list",
    auditDedupeMin(), auth.sid, req,
  );
  return ok({
    claims: claims.map((c) => ({ ...c, readiness: claimReadiness(c) })),
    savingsTrend,
    pipeline: auth.user.role === "payer" ? null : await pipelineStats(),
    total,
    page,
    pageSize,
  });
});
