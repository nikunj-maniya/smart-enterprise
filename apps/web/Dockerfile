# Dev-runtime image for the web app (Vite + React)
FROM node:20-slim

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install

COPY packages/shared packages/shared
COPY apps/web apps/web

EXPOSE 5173
CMD ["pnpm", "--filter", "@se/web", "dev", "--host"]
