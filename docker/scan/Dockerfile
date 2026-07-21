FROM node:20-alpine

# Scan Service - Playwright Chromium for screenshot, cookies
# Build from project root: docker build -f docker/scan/Dockerfile -t scan-service .

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache

WORKDIR /app

RUN set -eu; \
    attempts=0; \
    while [ "$attempts" -lt 3 ]; do \
      apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont && break; \
      attempts=$((attempts + 1)); \
      echo "apk add failed, retry ${attempts}/3" >&2; \
      rm -rf /var/cache/apk/*; \
      sleep 2; \
    done; \
    if [ "$attempts" -ge 3 ]; then \
      echo "apk add failed after retries" >&2; \
      exit 1; \
    fi

COPY --chown=node:node backend/scan/package.json backend/scan/package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node backend/scan ./

EXPOSE 4000

USER node

CMD ["node", "server.js"]
