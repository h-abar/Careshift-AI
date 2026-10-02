import { prisma } from "@/lib/server/prisma";
import { requireAuth } from "@/lib/server/session";
import { handle } from "@/lib/server/json";
import { ApiError } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { textPdf } from "@/lib/pdf";
import { toBibtex, toRis } from "@/lib/governance";

/**
 * B4 — GET /api/references/scientific/export?fmt=pdf|bib|ris.
 * PDF carries the citation list (Latin font); bib/ris are raw files.
 */
export const GET = handle(async (req: Request) => {
  const auth = await requireAuth();
  const fmt = new URL(req.url).searchParams.get("fmt") ?? "pdf";
  const refs = await prisma.reference.findMany({ orderBy: { key: "asc" } });

  await audit(
    {
      userId: auth.user.id, action: "rules.export",
      entityType: "kb", entityId: `references-${fmt}`,
      sessionId: auth.sid,
    },
    req,
  );

  if (fmt === "bib") {
    const body = refs.map(toBibtex).join("\n\n");
    return new Response(body, {
      headers: {
        "content-type": "application/x-bibtex; charset=utf-8",
        "content-disposition": 'attachment; filename="careshift-references.bib"',
      },
    });
  }
  if (fmt === "ris") {
    const body = refs.map(toRis).join("\n\n");
    return new Response(body, {
      headers: {
        "content-type": "application/x-research-info-systems; charset=utf-8",
        "content-disposition": 'attachment; filename="careshift-references.ris"',
      },
    });
  }
  if (fmt !== "pdf") throw new ApiError(400, "unknown format");

  const lines = refs.map(
    (r) =>
      `${r.key} — ${r.titleEn} (${r.venue}${r.year ? `, ${r.year}` : ""}) [${r.kind}: ${r.value}]`,
  );
  const pdf = textPdf(
    "Careshift AI — Scientific References (Simulated demo)",
    lines,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="careshift-references.pdf"',
    },
  });
});
