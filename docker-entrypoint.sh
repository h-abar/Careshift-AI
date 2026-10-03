#!/bin/sh
# Careshift AI container entrypoint (item 9):
#   1) prisma migrate deploy  — always; idempotent, brings DB to HEAD
#   2) seed demo data         — ONLY when SEED_DEMO=1 AND APP_ENV!=production
#   3) node server.js         — standalone Next server
set -e

# The standalone build traces prisma.config.ts into /app, but the runner has
# neither `prisma` nor `dotenv` installed — loading it crashes the CLI and the
# client. It is build-time only; drop it before any prisma invocation.
rm -f prisma.config.ts

prisma migrate deploy --schema=prisma/schema.prisma

if [ "$SEED_DEMO" = "1" ] && [ "$APP_ENV" != "production" ]; then
  echo "[entrypoint] SEED_DEMO=1 and APP_ENV=${APP_ENV:-unset} — seeding demo data"
  tsx prisma/seed.ts
else
  echo "[entrypoint] seed skipped (SEED_DEMO=${SEED_DEMO:-unset}, APP_ENV=${APP_ENV:-unset})"
fi

exec node server.js
