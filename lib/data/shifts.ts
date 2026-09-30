import type { ShiftHandoff } from "@/lib/types";

export const handoffs: ShiftHandoff[] = [
  {
    id: "HO-AM",
    fromShift: { en: "Night Shift", ar: "الشيفت الليلي" },
    toShift: { en: "Day Shift", ar: "الشيفت الصباحي" },
    at: "07:00",
    outgoingTeam: "Team B — 6 nurses, 2 physicians",
    incomingTeam: "Team A — 7 nurses, 3 physicians",
  },
  {
    id: "HO-PM",
    fromShift: { en: "Day Shift", ar: "الشيفت الصباحي" },
    toShift: { en: "Night Shift", ar: "الشيفت الليلي" },
    at: "19:00",
    outgoingTeam: "Team A — 7 nurses, 3 physicians",
    incomingTeam: "Team B — 6 nurses, 2 physicians",
  },
];
