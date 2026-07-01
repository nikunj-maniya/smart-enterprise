# Dev-runtime image for the API (Node.js + TypeScript + Express + Prisma)
FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app

# Install workspace deps (manifests first for layer caching)
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install

# Copy sources
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @se/api prisma:generate

EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @se/api prisma:deploy && pnpm --filter @se/api seed && pnpm --filter @se/api dev"]
