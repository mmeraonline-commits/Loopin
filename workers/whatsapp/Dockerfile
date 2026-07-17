# WhatsApp Baileys always-on worker
# Mount a volume at /data/whatsapp-sessions for persistent sessions.

FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY scripts/patch-esm-exports.cjs ./scripts/patch-esm-exports.cjs
RUN node scripts/patch-esm-exports.cjs

COPY tsconfig.json ./
COPY lib ./lib
COPY workers/whatsapp ./workers/whatsapp

ENV NODE_ENV=production
ENV WHATSAPP_SESSION_DIR=/data/whatsapp-sessions
ENV PORT=8787

RUN mkdir -p /data/whatsapp-sessions

EXPOSE 8787

CMD ["npx", "tsx", "workers/whatsapp/server.ts"]
