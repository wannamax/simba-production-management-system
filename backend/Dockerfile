FROM node:22.18.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .
RUN mkdir -p uploads/csv && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=45s CMD node -e="fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
