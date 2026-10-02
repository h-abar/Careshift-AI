# Multi-tenancy (D2)

Careshift is a multi-hospital platform: every hospital is a **tenant**
(`Tenant` row, keyed by a slug like `demo`). All tenant-owned clinical,
event, claim, user, audit and operational rows carry `tenantId`.

## Model

- `Tenant { id, nameEn, nameAr, simulated, configJson }`
  - `simulated` marks demo tenants (the UI keeps the "Simulated" badge).
  - `configJson` holds per-tenant config: enabled ingestion adapters,
    NPHIES provider id, thresholds version (see `tenantConfig()`).
- `tenantId` (required, indexed) on: User, Session, Patient, Shift,
  Assignment, Notification, NotificationReceipt, ShiftHandoff, Handoff,
  HandoffPatient, HandoffEvent, RiskAssessment, InsuranceClaim,
  ClaimLine, ClaimDocument, ClaimEvent, InterventionOverride,
  JourneyEvent, AuditLog, LoginAttempt, RateBucket, ClinicalEvent,
  IngestionDeadLetter, RuleExecution.
- **Global (shared) tables** — deliberately not tenant-scoped: Role,
  Rule, RuleVersion, RuleReference, Reference, Terminology,
  KpiDefinition, ExtCache. These are the shared knowledge base; the same
  clinical rules apply to every tenant.

## Enforcement

Enforcement is **server-side and structural**, not per-route checks:

1. `getAuth` resolves the session, then calls `enterTenant(user.tenantId)`
   — the tenant is pinned in AsyncLocalStorage for the rest of the
   request.
2. `prisma` (`lib/server/prisma.ts`) is a Proxy that resolves a
   per-tenant extended client. Each extended client runs a query
   interceptor (`lib/server/tenant.ts`) that:
   - AND-s `tenantId` into every read where-clause and every
     updateMany/deleteMany filter,
   - appends `tenantId` to whereUnique selectors (findUnique, update,
     delete, upsert — extendedWhereUnique accepts extra scalar fields),
   - stamps `tenantId` into every create/createMany payload.
3. Consequence: a foreign tenant's ids are indistinguishable from
   missing rows — `findUnique` → null, `update`/`delete` → P2025
   (surfaced as `TenantGuardError`), `upsert` → unique-violation.
   Client-supplied `tenantId` in a where clause can only **narrow**, never
   widen, because the guard AND-s its own tenant predicate.
4. No ALS context (seed, migrations, scripts, tests using the raw
   client) → unscoped base client. Request paths always go through
   `requireAuth` which sets the context. `unscoped(fn)` is the explicit
   escape hatch for cross-tenant bootstrap code.

Why per-tenant extended clients: Prisma's `$extends` query pipeline does
not propagate AsyncLocalStorage context into the interceptor, so the
tenant is bound at client construction instead.

## Event store

`appendEvent` stamps `tenantId` from the request context, or — for
unscoped callers (seed, offline ingestion) — resolves the owning
patient's tenant. The per-patient hash chain never crosses tenants.

## Tenants in the seed

- `demo` — Careshift Demo Hospital (all existing demo data).
- `sim-east` — a second clearly-Simulated tenant with one user
  (`east.nurse`) and one patient (`P-SE-1`), used by the isolation
  tests.

## Tests

`tests/tenant.test.ts` proves: reads scoped per tenant, foreign
findUnique → null, foreign update/delete rejected, client-supplied
tenantId cannot widen scope, create stamping, unscoped bootstrap path,
and that the knowledge base stays global.
