/**
 * C1 — verify the clinical event hash chain.
 * Usage: npx tsx scripts/verify-events.ts [patientId]
 * Exits non-zero on the first broken link (tamper detection).
 */
import { prisma } from "../lib/server/prisma";
import { verifyChain } from "../lib/server/events";

async function main() {
  const pid = process.argv[2];
  const ids = pid
    ? [pid]
    : (await prisma.clinicalEvent.findMany({
        select: { patientId: true }, distinct: ["patientId"],
      })).map((r) => r.patientId);

  let bad = 0;
  for (const id of ids) {
    const v = await verifyChain(id);
    const tag = v.ok ? "OK " : "BROKEN";
    console.log(`${tag} ${id}  events=${v.checked}${v.brokenAt ? `  brokenAt=${v.brokenAt}` : ""}`);
    if (!v.ok) bad++;
  }
  if (bad) {
    console.error(`\n${bad} chain(s) failed verification`);
    process.exit(1);
  }
  console.log(`\n${ids.length} chain(s) verified`);
}

main().finally(() => prisma.$disconnect());
