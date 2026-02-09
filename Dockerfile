# Stage 1: Build TypeScript
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# Stage 2: Production
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app

# Install only Firefox browser (saves ~400MB vs all browsers)
RUN npx playwright install --with-deps firefox

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ dist/

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
