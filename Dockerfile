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

# Create non-root user
RUN groupadd -g 1001 steer && \
    useradd -u 1001 -g steer -s /bin/bash steer

# Install only Firefox browser (saves ~400MB vs all browsers)
RUN npx playwright install --with-deps firefox

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ dist/

# Set ownership
RUN chown -R steer:steer /app

# Switch to non-root user
USER steer

ENV NODE_ENV=production
ENV STEER_HEADLESS=true
ENV STEER_HOST=0.0.0.0
ENV STEER_PORT=3000
ENV STEER_BROWSER=firefox

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1})"

# Default: REST API server. Override with: docker run steer node dist/cli.js --mcp
CMD ["node", "dist/cli.js"]
