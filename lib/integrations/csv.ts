/**
 * D1 — CSV/MIMIC-demo adapter. Rows shaped like MIMIC chartevents:
 *   subject_id,itemid,value,valuenum,valueuom,charttime
 * `itemMap` (itemid → vitalKey) is part of the versioned mapping —
 * callers supply it so nothing is invented.
 */
import { MAPPING_VERSION } from "./mappings";
import { ParseError, type SourceAdapter, type SourceEvent } from "./types";

export interface CsvRow {
  subject_id: string;
  itemid: string;
  value: string;
  valuenum?: string;
  valueuom?: string;
  charttime: string;
  label?: string;
}

export function parseCsv(text: string): CsvRow[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",").map((c) => c.trim());
  return lines.filter(Boolean).map((l) => {
    const cells = l.split(",");
    const row: Record<string, string> = {};
    cols.forEach((c, i) => (row[c] = cells[i] ?? ""));
    return row as unknown as CsvRow;
  });
}

export function csvAdapter(itemMap: Record<string, string>): SourceAdapter {
  return {
    name: "csv-mimic",
    parse(payload, resolvePatient) {
      const rows =
        typeof payload === "string" ? parseCsv(payload) : (payload as CsvRow[]);
      if (!Array.isArray(rows)) throw new ParseError("CSV payload not rows");
      return rows.map((r, i) => {
        const patientRef = String(r.subject_id ?? "");
        const patientId = resolvePatient
          ? resolvePatient(patientRef) ?? patientRef
          : patientRef;
        if (!patientId) throw new ParseError(`row ${i}: no subject_id`);
        const at = new Date(r.charttime);
        if (Number.isNaN(at.getTime()))
          throw new ParseError(`row ${i}: bad charttime`);
        const vitalKey = itemMap[String(r.itemid)];
        return {
          patientId,
          type: vitalKey ? "vital_set" : "lab_result",
          occurredAt: at,
          actorRole: "system",
          payload: {
            itemid: String(r.itemid),
            label: r.label ?? "",
            value: r.valuenum ?? r.value,
            unit: r.valueuom ?? "",
            ...(vitalKey ? { vitalKey } : {}),
          },
          sourceSystem: `csv-mimic:${MAPPING_VERSION}`,
          sourceRecordId: `${patientRef}:${r.itemid}:${r.charttime}`,
        } satisfies SourceEvent;
      });
    },
  };
}
