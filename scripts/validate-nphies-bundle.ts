/**
 * C10 — validate a generated NPHIES message bundle.
 *
 *   npx tsx scripts/validate-nphies-bundle.ts <bundle.json>
 *
 * Runs the internal structural validator (lib/nphies/validate.ts). For
 * full conformance run the official HL7 validator against the IG:
 *
 *   java -jar tools/fhir/validator_cli.jar <bundle.json> \
 *        -version 4.0.1 -ig knowledge/nphies-ig/package.tgz
 *
 * The IG package is marked notForPublication and SBS/medication code
 * systems are public fragments — terminology checks are partial and
 * NPHIES applies further business rules (BV-xxxxx).
 */
import { readFileSync } from "node:fs";
import { validateBundle } from "../lib/nphies/validate";

const file = process.argv[2];
if (!file) {
  console.error("usage: npx tsx scripts/validate-nphies-bundle.ts <bundle.json>");
  process.exit(2);
}
const issues = validateBundle(JSON.parse(readFileSync(file, "utf-8")));
for (const i of issues) console.log(`${i.severity.toUpperCase()}  ${i.msg}`);
if (issues.some((i) => i.severity === "error")) process.exit(1);
console.log("bundle OK — internal structural checks passed");
