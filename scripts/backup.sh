#!/usr/bin/env bash
# Careshift AI — backup (item 11).
# pg_dump custom-format (compressed) + uploads tarball, timestamped under
# $BACKUP_DIR, keeping the last $BACKUP_KEEP archives (default 14).
#
#   DATABASE_URL=postgres://… UPLOAD_DIR=/app/uploads ./scripts/backup.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
UPLOAD_DIR="${UPLOAD_DIR:-./uploads}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

DB_OUT="$BACKUP_DIR/careshift-db-$STAMP.dump"
UP_OUT="$BACKUP_DIR/careshift-uploads-$STAMP.tar.gz"

echo "==> pg_dump → $DB_OUT"
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  --file="$DB_OUT" "$DATABASE_URL"

if [ -d "$UPLOAD_DIR" ]; then
  echo "==> uploads → $UP_OUT"
  tar -czf "$UP_OUT" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
fi

# Retention: keep the newest $KEEP db dumps (+ matching uploads sets).
ls -1t "$BACKUP_DIR"/careshift-db-*.dump | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "    pruning $old"
  rm -f "$old" "${old%.dump}.tar.gz" "${old/db-/uploads-}"
  base="$(basename "$old" .dump)"; rm -f "$BACKUP_DIR/${base/careshift-db/careshift-uploads}.tar.gz"
done
ls -1t "$BACKUP_DIR"/careshift-uploads-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "==> done: $DB_OUT"
