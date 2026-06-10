# M.AI0.1 — Combined container (Next.js UI + Express API + nginx)
# One container → one Azure Container Apps URL
# Redis: external Upstash (set REDIS_URL env var)

# ─── Stage 1: Build Next.js ───────────────────────────
# Build in /build — NO parent package.json or pnpm-workspace.yaml above it.
# This prevents Next.js from auto-detecting the pnpm workspace root and
# placing server.js at standalone/apps/web/server.js instead of standalone/server.js.
FROM node:22-alpine AS web-builder
WORKDIR /build

# Install with npm in isolation — no workspace context
COPY apps/web/package.json ./
RUN npm install

# Copy source and build
COPY apps/web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────
FROM node:22-alpine
RUN apk add --no-cache nginx supervisor

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install backend deps — no workspace yaml so pnpm treats as simple package
COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile --ignore-scripts

# Copy backend source
COPY core/    ./core/
COPY config/  ./config/
COPY scripts/ ./scripts/
RUN mkdir -p /app/data/memory /app/projects

# Next.js standalone — isolated build means server.js is at standalone/ root
COPY --from=web-builder /build/.next/standalone/ ./apps/web/
COPY --from=web-builder /build/.next/static/ ./apps/web/.next/static/
COPY --from=web-builder /build/public/ ./apps/web/public/

# nginx + supervisor configs
COPY dockerfiles/nginx.conf      /etc/nginx/nginx.conf
COPY dockerfiles/supervisord.conf /etc/supervisord.conf

EXPOSE 80
ENV NODE_ENV=production
ENV PORT=3001
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["supervisord", "-n", "-c", "/etc/supervisord.conf"]
