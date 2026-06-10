# M.AI0.1 — Combined container (Next.js UI + Express API + nginx)
# One container → one Azure Container Apps URL
# Redis: external Upstash (set REDIS_URL env var)

# ─── Stage 1: Build Next.js ───────────────────────────
FROM node:22-alpine AS web-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Full workspace context — pnpm needs package.json in every workspace dir
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/package.json
COPY core/package.json     ./core/package.json

# Install (no frozen — core/package.json was added for Docker compatibility)
RUN pnpm install --no-frozen-lockfile

# Copy source and build
COPY apps/web/ ./apps/web/
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && pnpm run build

# ─── Debug: show standalone structure ─────────────────
RUN find /app/apps/web/.next/standalone -maxdepth 3 -name "*.js" 2>/dev/null | head -20

# ─── Stage 2: Runtime ─────────────────────────────────
FROM node:22-alpine
RUN apk add --no-cache nginx supervisor

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install backend deps — no workspace yaml so pnpm treats as simple package
# (pnpm ignores "workspaces" in package.json; only reads pnpm-workspace.yaml)
COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile --ignore-scripts

# Copy backend source
COPY core/    ./core/
COPY config/  ./config/
COPY scripts/ ./scripts/
RUN mkdir -p /app/data/memory /app/projects

# Next.js standalone — pnpm auto-detects workspace root, so in a pnpm monorepo
# Next.js places server.js at standalone/apps/web/ (not standalone/ root)
COPY --from=web-builder /app/apps/web/.next/standalone/apps/web/ ./apps/web/
COPY --from=web-builder /app/apps/web/.next/standalone/node_modules/ ./apps/web/node_modules/
COPY --from=web-builder /app/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=web-builder /app/apps/web/public/ ./apps/web/public/

# nginx + supervisor configs
COPY dockerfiles/nginx.conf      /etc/nginx/nginx.conf
COPY dockerfiles/supervisord.conf /etc/supervisord.conf

EXPOSE 80
ENV NODE_ENV=production
ENV PORT=3001
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["supervisord", "-n", "-c", "/etc/supervisord.conf"]
