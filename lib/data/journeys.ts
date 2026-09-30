import type { JourneyEvent } from "@/lib/types";

// Full digital journey for the hero DKA demo case P-1042.
// Events reference i18n keys under "journey.*" (see lib/i18n/*).
export const journeys: Record<string, JourneyEvent[]> = {
  "P-1042": [
    { t: "07:00", kind: "admission", key: "admitAbdominal" },
    { t: "08:30", kind: "signal", key: "signalGlucose" },
    { t: "09:20", kind: "risk", key: "riskDetected", riskScore: 87 },
    { t: "09:21", kind: "notify", key: "sbarGenerated" },
    { t: "09:22", kind: "notify", key: "nurseNotified" },
    { t: "09:30", kind: "action", key: "glucoseRechecked" },
    { t: "09:45", kind: "notify", key: "physicianNotified" },
    { t: "09:52", kind: "action", key: "insulinStarted" },
    { t: "10:15", kind: "review", key: "physicianReview" },
    { t: "10:20", kind: "outcome", key: "riskDropped", riskScore: 42 },
    { t: "11:30", kind: "outcome", key: "stabilized", riskScore: 18 },
  ],
  "P-2031": [
    { t: "22:40", kind: "admission", key: "admitPneumonia" },
    { t: "02:10", kind: "signal", key: "signalBp" },
    { t: "02:25", kind: "risk", key: "riskSepsis", riskScore: 82 },
    { t: "02:30", kind: "notify", key: "nurseNotified" },
    { t: "02:55", kind: "action", key: "sepsisBundle" },
    { t: "04:00", kind: "review", key: "physicianReview" },
  ],
};

export const getJourney = (id: string): JourneyEvent[] =>
  journeys[id] ?? [
    { t: "—", kind: "admission", key: "admitted" },
    { t: "—", kind: "review", key: "routineMonitoring" },
  ];
