/**
 * D1 — ingestion pipeline: adapter.parse → per-event dedupe on
 * (sourceSystem, sourceRecordId) → appendEvent. Failures land in
 * IngestionDeadLetter with the raw payload; nothing is dropped silently.
 */
import { prisma } from "@/lib/server/prisma";
import { appendEvent, type AppendEventInput } from "@/lib/server/events";
import { MAPPING_VERSION } from "./mappings";
import type { SourceAdapter, SourceEvent } from "./types";
import { Prisma } from "@prisma/client";

export interface IngestReport {
  adapter: string;
  mappingVersion: string;
  received: number;     // payloads parsed into events
  appended: number;
  duplicates: number;   // already in the store — skipped, idempotent
  deadLettered: number; // payloads that failed to parse
  eventIds: string[];
}

export async function ingest(
  adapter: SourceAdapter,
  payloads: unknown[],
  resolvePatient?: (ref: string) => string | null,
): Promise<IngestReport> {
  const report: IngestReport = {
    adapter: adapter.name,
    mappingVersion: MAPPING_VERSION,
    received: 0, appended: 0, duplicates: 0, deadLettered: 0,
    eventIds: [],
  };

  for (const payload of payloads) {
    let events: SourceEvent[];
    try {
      events = adapter.parse(payload, resolvePatient);
      report.received += events.length;
    } catch (e) {
      report.deadLettered++;
      await prisma.ingestionDeadLetter.create({
        data: {
          adapter: `${adapter.name}:${MAPPING_VERSION}`,
          payloadJson: JSON.stringify(payload ?? null).slice(0, 8000),
          error: e instanceof Error ? e.message : String(e),
        },
      });
      continue;
    }

    for (const ev of events) {
      try {
        const input: AppendEventInput = { ...ev };
        const created = await appendEvent(input);
        report.appended++;
        report.eventIds.push(created.id);
      } catch (e) {
        // Unique (sourceSystem, sourceRecordId) → already ingested
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          report.duplicates++;
        } else {
          report.deadLettered++;
          await prisma.ingestionDeadLetter.create({
            data: {
              adapter: `${adapter.name}:${MAPPING_VERSION}`,
              payloadJson: JSON.stringify(ev).slice(0, 8000),
              error: e instanceof Error ? e.message : String(e),
            },
          });
        }
      }
    }
  }
  return report;
}
