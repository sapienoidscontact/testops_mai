# M.AI0.1 — App (Orchestrator + API)
# Runs on: Node.js 20 Alpine
# No GPU, no native builds. Lightweight.

FROM node:20-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# ─── Deps ────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# ─── Runtime ─────────────────────────────────────────
FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules

# Copy source (not projects/ — mounted as volume)
COPY core/ ./core/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY package.json ./

# Create data dir
RUN mkdir -p /app/data/memory

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "--experimental-vm-modules", "core/orchestrator/index.js"]
