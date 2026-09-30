import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/session";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
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
