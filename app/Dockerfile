# Nest liefert API und Vue-Build aus.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1

FROM base AS build
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY api/prisma api/prisma
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY api/prisma api/prisma
COPY web/package.json web/
RUN npm ci --omit=dev --workspace api --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/web/dist web/dist

USER node
WORKDIR /app/api
EXPOSE 8000
CMD ["sh", "-c", "/app/node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
