/**
 * D2 — multi-tenant guard.
 *
 * Request-scoped tenant travels via AsyncLocalStorage:
 * `requireAuth`/`getAuth` calls `enterTenant(user.tenantId)` and every
 * later `prisma.*` access in that async context is forwarded (through
 * the Proxy in lib/server/prisma.ts) to a per-tenant extended client
 * whose query interceptor has the tenant bound at construction —
 * Prisma's extension pipeline does not preserve ALS context, so the
 * tenant cannot be read from ALS inside the interceptor itself.
 *
 * Rules enforced by the interceptor:
 *  - Tenant-scoped models (below) get `tenantId` injected into every
 *    read where-clause and every create/createMany payload.
 *  - findUnique/update/delete/upsert selectors carry tenantId as an
 *    extra whereUnique filter — foreign rows behave as "not found"
 *    (null / P2025-wrapped TenantGuardError / unique violation).
 *  - updateMany/deleteMany get the tenant AND-ed into their where, so
 *    foreign rows are simply untouched.
 *  - No tenant context (seed, migrations, scripts) → the raw client —
 *    unscoped — because bootstrap code legitimately writes any tenant.
 *    Request paths always go through requireAuth, which sets the ctx.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const g = globalThis as unknown as { __tenantCtx?: AsyncLocalStorage<string | null> };
export const tenantCtx = (g.__tenantCtx ??= new AsyncLocalStorage<string | null>());

/** Current request tenant, or null when unscoped. */
export const currentTenant = () => tenantCtx.getStore() ?? null;

/** Pin the tenant for the remainder of this async context. */
export const enterTenant = (tenantId: string) => tenantCtx.enterWith(tenantId);

/** Run fn with an explicit tenant (tests, jobs). */
export const withTenant = <T>(tenantId: string, fn: () => T): T =>
  tenantCtx.run(tenantId, fn);

/** Explicit escape hatch for cross-tenant bootstrap/admin code. */
export const unscoped = <T>(fn: () => T): T => tenantCtx.run(null, fn);

export class TenantGuardError extends Error {
  constructor(msg: string) {
    super(`cross-tenant access blocked: ${msg}`);
    this.name = "TenantGuardError";
  }
}

/** Models whose rows belong to exactly one tenant. KB/metadata models
 *  (Rule, Reference, Terminology, KpiDefinition, Role, ExtCache, Tenant)
 *  are deliberately global — shared clinical knowledge, not tenant data. */
export const TENANT_MODELS = new Set([
  "User", "Session", "Patient", "Shift", "Assignment", "Notification",
  "NotificationReceipt", "ShiftHandoff", "Handoff", "HandoffPatient",
  "HandoffEvent", "RiskAssessment", "InsuranceClaim", "ClaimLine",
  "ClaimDocument", "ClaimEvent", "InterventionOverride", "JourneyEvent",
  "AuditLog", "LoginAttempt", "RateBucket", "ClinicalEvent",
  "IngestionDeadLetter", "RuleExecution",
]);

const READ_OPS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "count", "aggregate",
  "groupBy",
]);
const UNIQUE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "update", "delete", "upsert",
]);
const MANY_OPS = new Set(["updateMany", "deleteMany"]);

const withTenantWhere = (args: Record<string, unknown>, tenantId: string) => ({
  ...args,
  where: { AND: [(args.where as object) ?? {}, { tenantId }] },
});

/**
 * Build the $allOperations interceptor for ONE tenant.
 *
 * Design: zero extra queries. tenantId is AND-ed into regular where
 * clauses and appended to whereUnique selectors (Prisma's
 * extendedWhereUnique accepts non-unique scalar fields, so
 * `findUnique({ where: { id, tenantId } })` and compound selectors like
 * `{ a_b: {...}, tenantId }` both work). Consequences:
 *  - foreign-row reads look like "not found" (null / P2025 / NotFound) —
 *    cross-tenant ids are indistinguishable from missing ones, which is
 *    the desired security posture;
 *  - update/delete on a foreign row throw P2025, surfaced as
 *    TenantGuardError for clarity in logs;
 *  - upsert on a foreign row attempts create → unique-violation error;
 *  - create/createMany get tenantId stamped into the payload;
 *  - updateMany/deleteMany are scoped by AND-ing the where.
 */
export function tenantGuard(tenantId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async function guard({ model, operation, args, query }: any) {
    if (!TENANT_MODELS.has(model)) return query(args);
    const m = model as string;

    if (READ_OPS.has(operation)) return query(withTenantWhere(args, tenantId));
    if (UNIQUE_OPS.has(operation)) {
      const scopedArgs = {
        ...args,
        where: { ...(args.where as object), tenantId },
      };
      if (operation === "upsert") {
        scopedArgs.create = {
          ...(args.create as Record<string, unknown>), tenantId,
        };
      }
      try {
        return await query(scopedArgs);
      } catch (e) {
        // P2025 record-not-found on update/delete → foreign or missing
        if (
          (operation === "update" || operation === "delete") &&
          (e as { code?: string })?.code === "P2025"
        )
          throw new TenantGuardError(`${m}.${operation}: row not in tenant`);
        throw e;
      }
    }
    if (MANY_OPS.has(operation)) return query(withTenantWhere(args, tenantId));
    if (operation === "create") {
      return query({
        ...args,
        data: { ...(args.data as Record<string, unknown>), tenantId },
      });
    }
    if (operation === "createMany") {
      const rows = (args.data as Record<string, unknown>[]).map((d) => ({
        ...d, tenantId,
      }));
      return query({ ...args, data: rows });
    }
    return query(args);
  };
}

/** Per-tenant config (adapters, NPHIES provider id, thresholds version). */
export interface TenantConfig {
  adapters?: string[];
  nphiesProviderId?: string;
  thresholdsVersion?: string;
}
export function tenantConfig(tenant: { configJson: string }): TenantConfig {
  try {
    return JSON.parse(tenant.configJson) as TenantConfig;
  } catch {
    return {};
  }
}
