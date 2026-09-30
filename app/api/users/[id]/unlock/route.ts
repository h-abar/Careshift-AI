import { requirePerm } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { unlockUsername } from "@/lib/server/lockout";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import { rateGuard } from "@/lib/server/ratelimit";

/** Admin action: clear a user's login lockout (failed-attempt window). */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("users_manage");
    const { id } = await ctx.params;
    const rg = await rateGuard(auth.user.id, "userAdmin");
    if (rg) return rg;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return Response.json({ error: "not found" }, { status: 404 });

    const cleared = await unlockUsername(user.username);
    await audit(
      {
        userId: auth.user.id,
        action: "auth.unlock",
        entityType: "user",
        entityId: id,
        next: { username: user.username, clearedAttempts: cleared },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ cleared });
  },
);
