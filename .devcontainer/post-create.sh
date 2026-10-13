#!/usr/bin/env bash
set -e

echo "Installing dependencies (pnpm) and workspace packages..."
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile || pnpm install
else
  echo "pnpm not found, installing via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
  pnpm install || true
fi

# Generate Prisma client if schema exists
if [ -f apps/api/prisma/schema.prisma ]; then
  echo "Generating Prisma client..."
  pnpm --filter @ai-data-marketplace/api run prisma:generate || true
fi

echo "Post-create tasks finished. To run the app locally with Compose:"
echo "  docker compose up -d postgres"
echo "Then in one terminal: pnpm dev (will start both api and web)"
