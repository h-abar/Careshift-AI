# Backup & Restore (item 11)

## Production path — `pg_dump`/`pg_restore`

```bash
# Backup (compressed custom format + uploads tarball, keeps last 14)
DATABASE_URL=postgres://… UPLOAD_DIR=/app/uploads ./scripts/backup.sh
BACKUP_KEEP=14 ./scripts/backup.sh

# Restore into a FRESH database (never in-place over production)
RESTORE_URL=postgres://…/careshift_restore \
  ./scripts/restore.sh backups/careshift-db-<stamp>.dump
```

`restore.sh` ends with a verification query (row counts for patients,
users, claims, audit). Schedule `backup.sh` via cron/systemd timer/Task
Scheduler; store `backups/` off-host (object storage) for real deployments.

## Local / host-independent drill — `scripts/restore-drill.ts`

Some hosts (this dev box, or PGlite/`prisma dev`) have no pg_dump binary.
The drill script does the same end-to-end check logically: dump every
table to JSON → `CREATE SCHEMA` → `migrate deploy` → FK-ordered insert →
per-table count verify → drop the schema.

```bash
DATABASE_URL=postgres://… npx tsx scripts/restore-drill.ts
```

### Real drill output (2026-10-01, PGlite `prisma dev` server)

```
[drill] dumped → backups/drill_muos62um.json { role: 6, user: 10,
  patient: 22, shift: 2, assignment: 7, notification: 6,
  notificationReceipt: 18, shiftHandoff: 2, handoff: 3,
  insuranceClaim: 50, ... }
Datasource "db": PostgreSQL database "template1", schema "drill_muos62um"
Applying migration `20260930235609_init` — applied.
[drill] OK  role: 6/6
[drill] OK  user: 10/10
[drill] OK  session: 0/0
[drill] OK  patient: 22/22
[drill] OK  shift: 2/2
[drill] OK  assignment: 7/7
[drill] OK  notification: 6/6
[drill] OK  notificationReceipt: 18/18
[drill] OK  shiftHandoff: 2/2
[drill] OK  handoff: 3/3
[drill] OK  insuranceClaim: 50/50
[drill] PASS — schema drill_muos62um dropped
```

**Note:** the compose-database drill (`docker compose up` + pg_dump) could
not run on this machine — Docker is not installed. The logical drill above
ran against a real Postgres wire-protocol server (`prisma dev`/PGlite)
and verified all 21 tables round-trip.
