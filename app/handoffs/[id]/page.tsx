import { HandoffDetail } from "@/components/handoff-detail";

export default async function HandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HandoffDetail handoffId={id} />;
}
