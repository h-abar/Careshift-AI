/**
 * D1 — pluggable ingestion adapters. Each adapter converts one source
 * payload (FHIR resource/bundle, HL7v2 message, CSV row, webhook body)
 * into SourceEvents carrying sourceSystem + sourceRecordId so the
 * store can dedupe idempotently.
 */
import type { AppendEventInput } from "@/lib/server/events";

export interface SourceEvent extends AppendEventInput {
  sourceSystem: string;   // "<adapter>:<mappingVersion>"
  sourceRecordId: string; // unique within that system
}

export interface SourceAdapter {
  name: string;
  /** Parse one source payload → events. Throws with a useful message on
   *  malformed input; the ingester dead-letters the payload. */
  parse(payload: unknown, resolvePatient?: (ref: string) => string | null): SourceEvent[];
}

export class ParseError extends Error {}
