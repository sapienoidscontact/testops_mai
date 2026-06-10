# M.AI0.1 — Combined container (Next.js UI + Express API + nginx)
# One container → one Azure Container Apps URL
# Redis: external Upstash (set REDIS_URL env var)

# ─── Stage 1: Build Next.js ───────────────────────────
FROM node:20-alpine AS web-builder
WORKDIR /app/web
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY apps/web/package.json ./
RUN pnpm install --frozen-lockfile
COPY apps/web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ─── Stage 2: Runtime ─────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache nginx supervisor

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install backend deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy backend source
COPY core/    ./core/
COPY config/  ./config/
COPY scripts/ ./scripts/
RUN mkdir -p /app/data/memory /app/projects

# Copy Next.js standalone build
COPY --from=web-builder /app/web/.next/standalone ./apps/web/
COPY --from=web-builder /app/web/.next/static      ./apps/web/.next/static
COPY --from=web-builder /app/web/public            ./apps/web/public

# nginx config
COPY dockerfiles/nginx.conf /etc/nginx/nginx.conf

# supervisord config
COPY dockerfiles/supervisord.conf /etc/supervisord.conf

EXPOSE 80

ENV NODE_ENV=production
ENV PORT=3001
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["supervisord", "-n", "-c", "/etc/supervisord.conf"]
