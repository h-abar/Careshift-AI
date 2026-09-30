import { requirePerm } from "@/lib/server/session";
import { dbUser } from "@/lib/server/data";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requirePerm("users_manage");
    const { id } = await ctx.params;
    const user = await dbUser(id);
    if (!user) return Response.json({ error: "not found" }, { status: 404 });
    return ok({ user });
  },
);
