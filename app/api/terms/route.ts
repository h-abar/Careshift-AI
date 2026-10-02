import { ok, handle } from "@/lib/server/json";
import { TERMS_VERSION, TERMS_SECTIONS } from "@/lib/terms";

/** Public — the login page links here; bodies are i18n keys, not secrets. */
export const GET = handle(async () =>
  ok({ version: TERMS_VERSION, sections: TERMS_SECTIONS }),
);
