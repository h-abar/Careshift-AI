import { PrismaClient } from "@prisma/client";
import { currentTenant, tenantGuard } from "@/lib/server/tenant";

// Singleton — avoids hot-reload client storms in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const base =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = base;

/**
 * D2 — tenant enforcement.
 *
 * One extended client per tenant (cached); each carries a query
 * interceptor with the tenant bound at construction. `prisma` is a
 * Proxy that resolves the target client at property-access time, so a
 * call inside a request context (enterTenant in getAuth) is scoped while
 * seed/scripts/migrations with no context hit the raw client.
 *
 * ALS cannot be read inside the interceptor itself (Prisma's extension
 * pipeline does not propagate the store), which is why the tenant is
 * bound per-client instead.
 */
const scopedClients = new Map<string, PrismaClient>();
function scopedClient(tenant: string): PrismaClient {
  let c = scopedClients.get(tenant);
  if (!c) {
    c = base.$extends({
      query: {
        $allModels: {
          $allOperations: tenantGuard(tenant),
        },
      },
    }) as unknown as PrismaClient;
    scopedClients.set(tenant, c);
  }
  return c;
}

const target = () => {
  const t = currentTenant();
  return t ? scopedClient(t) : base;
};

export const prisma = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const c = target() as never;
    const v = Reflect.get(c as object, prop);
    return typeof v === "function" ? (v as CallableFunction).bind(c) : v;
  },
  has(_t, prop) {
    return prop in (target() as object);
  },
});

export type Db = PrismaClient;
