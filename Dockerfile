################################################################################
# Build stage - includes dev dependencies
ARG NODE_VERSION=20.18.1

################################################################################
# Build stage - optimized for smaller final image
FROM node:${NODE_VERSION}-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm@9.14.0

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# Clean up and prepare production node_modules
RUN pnpm prune --prod && \
    pnpm store prune && \
    rm -rf /root/.npm /tmp/* /usr/lib/node_modules/npm/man /usr/lib/node_modules/npm/doc /usr/lib/node_modules/npm/html /usr/lib/node_modules/npm/scripts

################################################################################
# Production stage - minimal Alpine
FROM node:${NODE_VERSION}-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S matrix && adduser -S matrix -u 1001

# Create .matrix directory with proper permissions for database
RUN mkdir -p /app/.matrix/database && \
    chown -R matrix:matrix /app/.matrix

# Copy only essential production files
COPY --from=builder --chown=matrix:matrix /app/dist ./dist
COPY --from=builder --chown=matrix:matrix /app/node_modules ./node_modules
COPY --from=builder --chown=matrix:matrix /app/package.json ./
COPY --from=builder --chown=matrix:matrix /app/memAgent ./memAgent

# Create a minimal .env file for Docker (environment variables will be passed via docker)
RUN echo "# Docker environment - variables passed via docker run" > .env

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    CONFIG_FILE=/app/memAgent/matrix.yml

# Switch to non-root user
USER matrix

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.request({host:'localhost',port:process.env.PORT||3000,path:'/health'}, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

# Single port for deployment platform
EXPOSE $PORT

# API server mode: REST APIs on single port
CMD ["sh", "-c", "node dist/src/app/index.cjs --mode api --port $PORT --host 0.0.0.0 --agent $CONFIG_FILE"]