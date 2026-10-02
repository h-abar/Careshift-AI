import { prisma } from "@/lib/server/prisma";
import { requireAuth } from "@/lib/server/session";
import { handle } from "@/lib/server/json";
import { audit } from "@/lib/server/audit";
import { textPdf } from "@/lib/pdf";

/** B1 — PDF export of the calculation rules for the jury. Latin-only
 *  base font: English text is exported (Arabic shows in-app). */
export const GET = handle(async (req: Request) => {
  const auth = await requireAuth();
  const rules = await prisma.rule.findMany({
    include: {
      refs: { include: { reference: true } },
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
    orderBy: { key: "asc" },
  });
  const lines: string[] = [];
  for (const r of rules) {
    const v = r.versions[0];
    lines.push(
      "",
      `${r.key} — ${r.nameEn} [${r.status} v${v?.version ?? "-"} ${r.category}]`,
      `  ${v?.noteEn ?? ""}`,
      `  refs: ${r.refs.map((x) => `${x.reference.kind}:${x.reference.value}`).join(", ")}`,
    );
  }
  const pdf = textPdf(
    "Careshift AI — Calculation Rules (Simulated demo)",
    lines,
  );
  await audit(
    {
      userId: auth.user.id, action: "rules.export",
      entityType: "kb", entityId: "calculation",
      sessionId: auth.sid,
    },
    req,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="careshift-rules.pdf"',
    },
  });
});
