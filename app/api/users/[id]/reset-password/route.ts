import { requirePerm } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import bcrypt from "bcryptjs";

/**
 * User-admin: reset a password → bcrypt hash. Never audited with the value.
 * When no password is supplied the server generates a one-time temporary
 * password and returns it exactly once — it is never stored in plaintext.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("users_manage");
    const { id } = await ctx.params;
    const { password } = (await req.json().catch(() => ({}))) as {
      password?: string;
    };
    if (password !== undefined && password.length < 8) {
      return Response.json({ error: "password too short" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return Response.json({ error: "not found" }, { status: 404 });

    const temp =
      password ??
      `Cs!${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(temp, 10) },
    });
    // Invalidate live sessions — the old credential can no longer be used.
    await prisma.session.deleteMany({ where: { userId: id } });

    await audit(
      {
        userId: auth.user.id,
        action: "user.password_reset",
        entityType: "user",
        entityId: id,
        next: { generated: password === undefined },
        sessionId: auth.sid,
      },
      req,
    );
    // The generated password is returned ONCE and is not retrievable later.
    return ok({ done: true, ...(password === undefined ? { tempPassword: temp } : {}) });
  },
);
