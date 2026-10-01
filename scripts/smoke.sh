#!/usr/bin/env bash
# Careshift AI — compose smoke test (item 9).
# Brings the stack up, waits for /api/ready, logs in as admin, fetches
# /api/snapshots. Usage:  bash scripts/smoke.sh
set -euo pipefail

BASE="${SMOKE_BASE:-http://127.0.0.1:3000}"
ADMIN_USER="${DEMO_ADMIN_USER:-o.khalil}"
ADMIN_PASS="${DEMO_ADMIN_PASS:-Demo@8895}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> docker compose up --build -d"
docker compose up --build -d

echo "==> waiting for /api/ready"
for i in $(seq 1 60); do
  body="$(curl -fsS "$BASE/api/ready" 2>/dev/null || true)"
  if echo "$body" | grep -q '"status":"ready"'; then
    echo "    ready after ${i} tries: $body"
    break
  fi
  [ "$i" = "60" ] && { echo "    FAIL: never became ready"; docker compose logs app | tail -30; exit 1; }
  sleep 2
done

echo "==> login as admin ($ADMIN_USER)"
code="$(curl -sS -o /tmp/cs-login.json -w '%{http_code}' \
  -c "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  "$BASE/api/auth/login")"
echo "    login HTTP $code"
[ "$code" = "200" ] || { cat /tmp/cs-login.json; exit 1; }

echo "==> GET /api/snapshots"
code="$(curl -sS -o /tmp/cs-snap.json -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/api/snapshots")"
echo "    snapshots HTTP $code"
if [ "$code" = "200" ]; then
  head -c 400 /tmp/cs-snap.json; echo
  echo "==> SMOKE PASS"
else
  cat /tmp/cs-snap.json; echo "==> SMOKE FAIL"; exit 1
fi
