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

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ dist/

ENV NODE_ENV=production
ENV ABBWAK_HEADLESS=true
ENV ABBWAK_HOST=0.0.0.0
ENV ABBWAK_PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
