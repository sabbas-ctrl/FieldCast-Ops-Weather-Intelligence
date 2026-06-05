# ── Stage 1: base ──────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app

# ── Stage 2: install dependencies ──────────────────────────────
FROM base AS deps
# Copy root manifest + lockfile
COPY package.json package-lock.json ./
# Copy ALL workspace package.json files so npm can resolve the workspace tree.
# (Even though we only build the API, npm workspaces requires every workspace
#  package.json to be present for `npm ci` to succeed.)
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts
# Generate the Prisma client after install (schema needed for types)
COPY apps/api/prisma apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# ── Stage 3: build TypeScript ──────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json
RUN npx tsc -p apps/api/tsconfig.json

# ── Stage 4: production runtime ────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Re-install production-only deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --ignore-scripts

# Re-generate Prisma client for the runtime image
COPY apps/api/prisma apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# Copy compiled JS from the build stage
COPY --from=build /app/apps/api/dist ./apps/api/dist

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
