#!/bin/sh
# Careshift AI container entrypoint (item 9):
#   1) prisma migrate deploy  — always; idempotent, brings DB to HEAD
#   2) seed demo data         — ONLY when SEED_DEMO=1 AND APP_ENV!=production
#   3) node server.js         — standalone Next server
set -e

prisma migrate deploy --schema=prisma/schema.prisma

if [ "$SEED_DEMO" = "1" ] && [ "$APP_ENV" != "production" ]; then
  echo "[entrypoint] SEED_DEMO=1 and APP_ENV=${APP_ENV:-unset} — seeding demo data"
  tsx prisma/seed.ts
else
  echo "[entrypoint] seed skipped (SEED_DEMO=${SEED_DEMO:-unset}, APP_ENV=${APP_ENV:-unset})"
fi

exec node server.js
