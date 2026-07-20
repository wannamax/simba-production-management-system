# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable \
    && corepack prepare pnpm@10.14.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=simba-backend-pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

COPY . .

RUN mkdir -p uploads/csv \
    && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["pnpm", "start"]