import { getAuth, tenantBadge } from "@/lib/server/session";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  const auth = await getAuth();
  if (!auth) return Response.json({ user: null }, { status: 200 });
  const tenant = await tenantBadge(auth.user.tenantId);
  return ok({
    user: auth.user,
    impersonator: auth.impersonator ?? null,
    tenant,
  });
});
