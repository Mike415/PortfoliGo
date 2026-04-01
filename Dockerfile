# ── Stage 1: Build the Node.js app ───────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install dependencies (patches/ must be present before pnpm install)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:22-slim AS runtime

# Install Python 3 + pip for the earnings microservice
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Copy built Node app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy Python earnings service
COPY server/earnings_service.py ./server/earnings_service.py

# Expose port (Railway injects PORT env var)
EXPOSE 3000

# Start both Python service and Node server
CMD python3 server/earnings_service.py & node dist/index.js
