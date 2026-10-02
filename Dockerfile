# syntax=docker/dockerfile:1

# Careshift AI — multi-stage build (item 9).
# builder: deps + prisma generate + next build (standalone)
# runner : node:alpine, non-root, standalone server + prisma CLI for
#          migrate deploy at container start.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# prisma CLI for `migrate deploy` + tsx for the demo seed on boot.
RUN npm install -g prisma@6.19.3 tsx@4.23.15 && npm cache clean --force
RUN addgroup -S careshift && adduser -S careshift -G careshift
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# B5 — generated artifacts the technical-references API reads at runtime
COPY --from=builder /app/docs/sbom.json ./docs/sbom.json
COPY --from=builder /app/docs/audit-summary.json ./docs/audit-summary.json
COPY --from=builder /app/docs/license-summary.json ./docs/license-summary.json
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/uploads && chown -R careshift:careshift /app
USER careshift
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
