import { patients, getPatient } from "@/lib/data/patients";
import { PatientView } from "@/components/patient-view";

export function generateStaticParams() {
  return patients.map((p) => ({ id: p.id }));
}

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const patient = getPatient(id);
  if (!patient) {
    return (
      <div className="py-20 text-center text-slate-400">Patient not found.</div>
    );
  }
  return <PatientView patientId={patient.id} />;
}
