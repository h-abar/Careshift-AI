# Deployment (item 13)

## Prerequisites

- Docker + Compose v2 (or any Postgres 14+ host + Node 22 runtime)
- A strong `SESSION_SECRET` (≥32 chars, e.g. `openssl rand -base64 48`)
- A TLS-terminating reverse proxy for production (nginx/Caddy/ALB)

## Environment variables

See `.env.example` for the full contract (validated by zod at boot —
production refuses to start on missing/weak values).

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/db` |
| `SESSION_SECRET` | prod | ≥32 chars; JWT kid `s1` |
| `SESSION_SECRET_PREV` | during rotation | previous key (kid `s0`) |
| `APP_ENV` | prod | `production` disables all demo seeding |
| `SEED_DEMO` | demo only | `1` seeds demo data; ignored when `APP_ENV=production` |
| `TRUSTED_PROXY` | behind proxy | `1` → honor `x-forwarded-for` (audit IP, lockout) |
| `UPLOAD_DIR` | no | default `./uploads` |
| `AV_PROVIDER`, `CLAMAV_HOST/PORT` | no | ClamAV scan for claim uploads |
| `CAPTCHA_PROVIDER`, `CAPTCHA_SECRET` | no | `turnstile`; softens username-wide lockout |
| `RL_*` | no | per-minute rate limits (login/userAdmin/upload/reassess/claimWrite) |
| `RETENTION_*_DAYS`, `DORMANT_DAYS` | no | retention purge + access review |
| `LOG_LEVEL`, `SENTRY_DSN` | no | JSON logs level; error reporting hook |
| `API_ORIGIN` | mobile | Capacitor WebView target origin |

## Docker Compose deploy

```bash
docker compose up --build -d        # demo stack (APP_ENV=demo, seeds)
# production compose: set APP_ENV=production, real DATABASE_URL, real
# SESSION_SECRET via secrets — and do NOT set SEED_DEMO.
```

The entrypoint runs `prisma migrate deploy` on every boot, seeds only when
`SEED_DEMO=1 && APP_ENV!=production`, then starts the standalone server.
Smoke test: `bash scripts/smoke.sh` (waits for `/api/ready`, logs in as
admin, fetches `/api/snapshots`).

## Reverse proxy / TLS

Terminate TLS at the proxy; forward to `:3000`:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
}
```

Set `TRUSTED_PROXY=1` **only** when a trusted proxy is in front — it makes
the app honor `x-forwarded-for` for audit IPs and login lockout. HSTS is
sent by the app; still enforce HTTPS redirects at the proxy.

## Migrations

`prisma migrate deploy` runs in `docker-entrypoint.sh`. For manual rollouts:
`DATABASE_URL=… npx prisma migrate deploy`. Never `migrate dev`/`db push`
against production.

## Backups

`./scripts/backup.sh` (pg_dump -Z9 + uploads tarball, `BACKUP_KEEP` pruning);
`./scripts/restore.sh` restores into a fresh DB and prints verification
counts. See `docs/backup-restore.md` for the tested drill.

## Monitoring

- `GET /api/health` — liveness (public, no data)
- `GET /api/ready` — DB + migration state, 503 when unready (compose healthcheck)
- `GET /api/metrics` — Prometheus counters (requires `audit_view` session)
- JSON logs on stdout (pino) — ship to your aggregator; secrets/PHI are redacted
- `SENTRY_DSN` enables the error-envelope reporter (no-op otherwise)

## Secret rotation

Session JWTs carry `kid`. To rotate `SESSION_SECRET`:

1. Set `SESSION_SECRET_PREV=<old secret>`, `SESSION_SECRET=<new secret>`.
2. Redeploy — new logins sign with `s1`; existing tokens verify via `s0`.
3. After the 8h session TTL, unset `SESSION_SECRET_PREV` and redeploy.

## Upgrade

1. `git pull` / deploy new image.
2. Entrypoint applies pending migrations (`migrate deploy` is forward-only).
3. Health-gate the rollout on `/api/ready`.

## Rollback

1. Re-deploy the previous image tag. App code is backwards-compatible within
   a minor version; **migrations are not auto-reverted**.
2. If a migration must be undone, restore from the most recent
   `scripts/backup.sh` dump into a fresh DB (`scripts/restore.sh`), verify,
   repoint `DATABASE_URL`.
