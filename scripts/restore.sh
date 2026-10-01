#!/usr/bin/env bash
# Careshift AI — restore into a FRESH database (item 11).
#   ./scripts/restore.sh backups/careshift-db-YYYYMMDDTHHMMSS.dump
#   RESTORE_URL=postgres://…/careshift_restore  (fresh DB — must exist/be creatable)
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump-file>}"
RESTORE_URL="${RESTORE_URL:?set RESTORE_URL to a fresh/empty database URL}"

echo "==> restoring $DUMP → $RESTORE_URL"
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$RESTORE_URL" "$DUMP"

echo "==> verification"
psql "$RESTORE_URL" -c \
  "SELECT 'patients' t, count(*) FROM patients
   UNION ALL SELECT 'users', count(*) FROM users
   UNION ALL SELECT 'claims', count(*) FROM \"InsuranceClaim\"
   UNION ALL SELECT 'audit', count(*) FROM \"AuditLog\"
   ORDER BY t;"
