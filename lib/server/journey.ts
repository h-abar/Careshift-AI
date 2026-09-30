import { prisma } from "@/lib/server/prisma";
import type { JourneyEvent } from "@/lib/types";

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Append a real event to the patient's persisted digital journey
 * (Patient.journeyJson) — the timeline is computed from events, not a
 * static fixture.
 */
export async function appendJourney(
  patientId: string,
  event: Omit<JourneyEvent, "t">,
) {
  try {
    const row = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { journeyJson: true },
    });
    if (!row) return;
    const arr = (JSON.parse(row.journeyJson ?? "[]") || []) as JourneyEvent[];
    arr.push({ t: nowHHMM(), ...event });
    await prisma.patient.update({
      where: { id: patientId },
      data: { journeyJson: JSON.stringify(arr) },
    });
  } catch (err) {
    console.error("appendJourney failed:", err);
  }
}
