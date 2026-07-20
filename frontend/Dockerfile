# syntax=docker/dockerfile:1.7

FROM node:22.18.0-bookworm-slim AS build

WORKDIR /app

ENV CI=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable \
    && corepack prepare pnpm@10.14.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=simba-frontend-pnpm,target=/pnpm/store \
    pnpm install \
      --frozen-lockfile \
      --config.confirmModulesPurge=false

COPY . .

RUN pnpm run build


FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK \
  --interval=10s \
  --timeout=5s \
  --start-period=10s \
  --retries=10 \
  CMD wget -qO- http://127.0.0.1/health || exit 1