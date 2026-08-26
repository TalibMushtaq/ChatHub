# syntax=docker/dockerfile:1

####################
# Base
####################
FROM node:20-alpine AS base
RUN npm install -g pnpm@10.29.2
WORKDIR /app

####################
# Dependencies
####################
FROM base AS deps
# Native deps (argon2, Prisma engines, esbuild) need a compiler on Alpine
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY packages ./packages

RUN pnpm install --frozen-lockfile

####################
# Prisma client
####################
FROM deps AS prisma
COPY apps/server/db ./apps/server/db
COPY apps/server/prisma.config.ts ./apps/server/
RUN pnpm --filter @repo/server prisma generate

####################
# Builder
####################
FROM prisma AS builder

# Next.js bakes these into the client bundle at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

COPY . .
RUN pnpm turbo run build

####################
# Runtime: Server
####################
FROM base AS server
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/db ./apps/server/db
COPY --from=builder /app/apps/server/docker-entrypoint.sh ./apps/server/
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./

WORKDIR /app/apps/server
RUN chmod +x docker-entrypoint.sh

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]

####################
# Runtime: Web
####################
FROM base AS web
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.js ./apps/web/
COPY --from=builder /app/apps/web/postcss.config.mjs ./apps/web/
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/turbo.json ./

WORKDIR /app/apps/web
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(0)).on('error', () => process.exit(1))"

CMD ["node_modules/.bin/next", "start"]
