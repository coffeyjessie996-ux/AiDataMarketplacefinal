#!/usr/bin/env bash
set -e

# Post-create tasks for Codespaces / devcontainer
# - ensure pnpm is available and install deps
# - create .env.local from example if missing
# - start local Postgres via docker compose
# - generate Prisma client

echo "Post-create: ensure pnpm and install dependencies"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile || pnpm install
else
  echo "pnpm not found, enabling corepack and installing pnpm..."
  corepack enable
  corepack prepare pnpm@latest --activate
  pnpm install || true
fi

# Create .env.local from example if it doesn't exist
if [ ! -f .env.local ] && [ -f .env.local.example ]; then
  echo ".env.local not found — creating from .env.local.example"
  cp .env.local.example .env.local
  echo "Created .env.local (do NOT commit this file). Edit it if you need to override values."
fi

# Start Postgres via docker compose if docker is available
if command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
  echo "Starting Postgres via docker compose..."
  docker compose up -d postgres || docker-compose up -d postgres || true

  # Wait for Postgres port to be open on localhost:5432 (max 30s)
  echo -n "Waiting for Postgres to accept connections"
  for i in {1..30}; do
    if (echo > /dev/tcp/localhost/5432) >/dev/null 2>&1; then
      echo "\nPostgres appears reachable"
      break
    fi
    echo -n "."
    sleep 1
  done
fi

# Generate Prisma client if schema exists
if [ -f apps/api/prisma/schema.prisma ]; then
  echo "Generating Prisma client for API..."
  pnpm --filter @ai-data-marketplace/api run prisma:generate || true
fi

cat <<'EOF'
Done with post-create steps.
Next steps (recommended):
  1) Ensure .env.local contains correct secrets (it's created from .env.local.example).
  2) Start Postgres if you didn't in the previous step: docker compose up -d postgres
  3) Initialize the database and run migrations (one-time):
       pnpm --filter @ai-data-marketplace/api run prisma:migrate
  4) Start the dev servers:
       pnpm dev

Notes:
  - .env.local is gitignored; never commit sensitive credentials.
  - If you're using an external DB (Supabase), set DATABASE_URL accordingly in .env.local.
EOF
