# Thenar public app/API. Signer keys belong to a separate signer service.
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_ARC_NETWORK=testnet
ARG NEXT_PUBLIC_PRIVY_APP_ID=""
ARG NEXT_PUBLIC_FEATURE_GATEWAY=0
ENV NEXT_PUBLIC_ARC_NETWORK=$NEXT_PUBLIC_ARC_NETWORK NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID NEXT_PUBLIC_FEATURE_GATEWAY=$NEXT_PUBLIC_FEATURE_GATEWAY NEXT_TELEMETRY_DISABLED=1
RUN npx next build --webpack

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 AXON_DB_PATH=/data/axon.db
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/deployments ./deployments
RUN mkdir -p /data && chown node:node /data
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/arc-entrypoint
ENTRYPOINT ["arc-entrypoint"]
EXPOSE 3000
CMD ["sh", "-c", "exec npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
