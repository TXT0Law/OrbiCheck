FROM node:20-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED=false
ARG INTERNAL_API_URL=http://backend:8000
ARG DISABLE_API_REWRITE=0

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED=${NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED}
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
ENV DISABLE_API_REWRITE=${DISABLE_API_REWRITE}

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
