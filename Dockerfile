# Stage 1: Build TypeScript
FROM node:24-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# Stage 2: Production
FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Add labels
LABEL maintainer="Ender Ekici"
LABEL description="Self-hosted headless browser for AI agents"
LABEL version="1.2.0"

WORKDIR /app

# Create non-root user (use high IDs to avoid conflicts with base image)
RUN groupadd -g 10001 steer && \
    useradd -u 10001 -g steer -s /bin/bash -m steer

# Base image already includes all browsers at /ms-playwright/
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist/ dist/

# Create writable cache directories for Firefox
RUN mkdir -p /home/steer/.cache && \
    mkdir -p /tmp/firefox-cache && \
    chown -R steer:steer /app /home/steer/.cache /tmp/firefox-cache

# Switch to non-root user
USER steer

ENV NODE_ENV=production
ENV STEER_HEADLESS=true
ENV STEER_HOST=0.0.0.0
ENV STEER_PORT=3000
ENV STEER_BROWSER=firefox

# Firefox-specific environment variables for Docker
ENV HOME=/home/steer
ENV XDG_CACHE_HOME=/tmp/firefox-cache
ENV DCONF_PROFILE=
ENV MOZ_DISABLE_CONTENT_SANDBOX=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1})"

# Default: REST API server. Override with: docker run steer node dist/cli.js --mcp
CMD ["node", "dist/cli.js"]
