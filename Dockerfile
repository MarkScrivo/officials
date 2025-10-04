# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install Playwright dependencies for Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package*.json ./

# Install production dependencies and Playwright browsers
RUN npm ci --only=production && \
    npx playwright install chromium --with-deps || true

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy JSON config files that weren't in TypeScript build
COPY src/config/*.json ./dist/config/

# Expose API port (adjust if needed)
EXPOSE 3000

# Start the application
CMD ["node", "dist/api/index.js"]
