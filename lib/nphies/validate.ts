/**
 * C10 — internal bundle validator. Structural checks derived from the
 * IG (Bundle.type=message, MessageHeader first with a valid
 * ksa-message-events code, IG profile URLs stamped, references resolve,
 * supportingInfo categories valid). The official HL7 validator remains
 * the conformance gate — see scripts/validate-nphies-bundle.ts and
 * docs/nphies-integration.md (validator_cli.jar -version 4.0.1 -ig).
 */
import { MESSAGE_EVENTS, INFO_CATEGORIES, PROFILES, SYSTEMS } from "./terminology";

export interface Issue { severity: "error" | "warning"; msg: string }

export function validateBundle(bundle: unknown): Issue[] {
  const issues: Issue[] = [];
  const b = bundle as {
    resourceType?: string; type?: string; meta?: { profile?: string[] };
    entry?: { fullUrl?: string; resource?: Record<string, unknown> }[];
  };
  const err = (msg: string) => issues.push({ severity: "error", msg });
  const warn = (msg: string) => issues.push({ severity: "warning", msg });

  if (b.resourceType !== "Bundle") err("resourceType must be Bundle");
  if (b.type !== "message") err("Bundle.type must be 'message'");
  const entries = b.entry ?? [];
  if (!entries.length) return [...issues, { severity: "error", msg: "empty bundle" }];

  // MessageHeader MUST be the first entry with a valid event code.
  const mh = entries[0].resource as {
    resourceType?: string;
    eventCoding?: { system?: string; code?: string };
    meta?: { profile?: string[] };
  };
  if (mh?.resourceType !== "MessageHeader") {
    err("first entry must be MessageHeader");
  } else {
    if (mh.eventCoding?.system !== SYSTEMS.messageEvents)
      err("MessageHeader.eventCoding.system must be ksa-message-events");
    const code = mh.eventCoding?.code;
    if (!code || !MESSAGE_EVENTS.includes(code as never))
      err(`event code '${code}' not in ksa-message-events`);
    if (!mh.meta?.profile?.some((p) => p.startsWith(PROFILES.messageHeader.split("|")[0])))
      warn("MessageHeader missing IG profile");
  }

  // every resource carries its IG profile
  for (const [i, e] of entries.entries()) {
    const r = e.resource ?? {};
    const profs = (r.meta as { profile?: string[] })?.profile ?? [];
    if (!profs.some((p) => p.includes("nphies-fs/StructureDefinition")))
      err(`entry[${i}] ${r.resourceType} lacks an nphies-fs profile`);
  }

  // internal references resolve
  const urls = new Set(entries.map((e) => e.fullUrl).filter(Boolean));
  const refs: string[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (k === "reference" && typeof v === "string") refs.push(v);
        else walk(v);
      }
    }
  };
  for (const e of entries) walk(e.resource);
  for (const r of refs) {
    if (r.startsWith(BASE_HINT) || r.startsWith("urn:")) {
      if (!urls.has(r)) warn(`reference ${r} not in bundle`);
    }
  }

  // supportingInfo categories must be IG claim-information-category codes
  for (const e of entries) {
    const r = e.resource as { resourceType?: string; supportingInfo?: { category?: { coding?: { system?: string; code?: string }[] } }[] };
    if (r?.supportingInfo) {
      for (const si of r.supportingInfo) {
        const c = si.category?.coding?.[0];
        if (c?.system !== SYSTEMS.claimInfoCategory)
          err("supportingInfo.category system must be claim-information-category");
        else if (!INFO_CATEGORIES.includes(c.code as never))
          err(`supportingInfo category '${c.code}' not in IG list`);
      }
    }
  }
  return issues;
}

const BASE_HINT = "https://";
