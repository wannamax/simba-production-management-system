# syntax=docker/dockerfile:1.7

FROM node:22.18.0-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    CI=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable \
    && corepack prepare pnpm@10.14.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=simba-backend-pnpm,target=/pnpm/store \
    pnpm install \
      --prod \
      --frozen-lockfile \
      --config.confirmModulesPurge=false

COPY . .

RUN chmod +x docker-entrypoint.sh \
    && mkdir -p uploads/csv \
    && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK \
  --interval=10s \
  --timeout=5s \
  --start-period=45s \
  --retries=12 \
  CMD node -e="fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]