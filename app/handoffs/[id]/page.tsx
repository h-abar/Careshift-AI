import { handoffRecords, getHandoff } from "@/lib/data/handoffs";
import { HandoffDetail } from "@/components/handoff-detail";

export function generateStaticParams() {
  return handoffRecords.map((h) => ({ id: h.id }));
}

export default async function HandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = getHandoff(id);
  if (!h) return <div className="py-20 text-center text-slate-400">Handoff not found.</div>;
  return <HandoffDetail handoffId={h.id} />;
}
