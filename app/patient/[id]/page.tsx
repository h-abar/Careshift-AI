import { PatientView } from "@/components/patient-view";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PatientView patientId={id} />;
}
