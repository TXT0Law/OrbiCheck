# Scan Service - Playwright Chromium for screenshot, cookies
# Build from project root: docker build -f docker/scan/Dockerfile -t scan-service backend/scan
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 4000
CMD ["node", "server.js"]
