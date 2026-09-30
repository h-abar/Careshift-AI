import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/session";
import type { ZodType } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Consistent validation error shape: {error, code, fields?}. */
export function validationError(fields: Record<string, string>) {
  return NextResponse.json(
    { error: "validation failed", code: "validation", fields },
    { status: 400 },
  );
}

type ParseResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: Response };

/**
 * Parse + validate a JSON body against a shared Zod schema.
 * Returns the typed data or a ready-to-return 400 response that rejects
 * unknown fields and reports per-field errors.
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: "invalid JSON body", code: "bad_json" },
        { status: 400 },
      ),
    };
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const iss of r.error.issues) {
      fields[iss.path.join(".") || "_"] = iss.message;
    }
    return { error: validationError(fields) };
  }
  return { data: r.data };
}

/** Wrap a handler: turns ApiError into proper status, everything else 500. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error(e);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  };
}
