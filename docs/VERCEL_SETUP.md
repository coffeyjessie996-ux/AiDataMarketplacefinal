# Vercel setup and environment variables

This file contains exact instructions and copy-pastable commands you can run locally (or in CI) to configure the Vercel projects for this repository. I cannot modify Vercel project settings from this repository — environment variables and project-level settings must be set in the Vercel dashboard or with your Vercel CLI (using a VERCEL_TOKEN you own).

Recommended approach

1) Create two Vercel projects (recommended):
   - Project A: web → select the repository and set the Project Root to `apps/web`
   - Project B: api → select the repository and set the Project Root to `apps/api`

   This keeps the Next.js frontend and the Express API separate and avoids monorepo routing confusion.

2) Add the environment variables (secrets) below to each project using the Vercel dashboard or the Vercel CLI.

Required / recommended environment variables

For the API project (apps/api)
- DATABASE_URL — Postgres connection string (Example: `postgresql://postgres:<PASSWORD>@db.host.supabase.co:5432/postgres?sslmode=require`)
- JWT_SECRET — long random secret used for signing tokens
- NODE_ENV — `production`
- FRONTEND_URL — the deployed web origin (e.g. `https://your-web-domain.vercel.app`) (useful for CORS and links)
- STRIPE_SECRET_KEY — (only if enabling real Stripe payouts)

Optional (Sentry / monitoring):
- SENTRY_AUTH_TOKEN
- SENTRY_ORG
- SENTRY_PROJECT

For the Web project (apps/web)
- NEXT_PUBLIC_API_URL — If you route `/api` through Vercel to the API project you can leave this as `/api`. If your API is on a separate domain, set it to the absolute origin (e.g. `https://api.example.com`).
- SENTRY_DSN (if you use Sentry client)

How to add them via the Vercel web dashboard

1. Open https://vercel.com and select the project (web or api).
2. Go to Settings → Environment Variables.
3. Add each variable for the required environments (Production, Preview, Development).
4. Redeploy the project after saving variables.

Quick commands (using Vercel CLI)

If you prefer the CLI, install the Vercel CLI and run the following commands locally. Replace placeholders and project names with your actual Vercel project names.

Notes:
- You must have `VERCEL_TOKEN` exported in your shell (generate it in Vercel account settings → Tokens).
- Replace `<PROJECT_NAME_API>` and `<PROJECT_NAME_WEB>` with the actual Vercel project names.
- These commands assume the Vercel CLI supports inline value assignment; if your CLI version prompts interactively, the dashboard method is easiest.

# Example commands (copy & paste and replace placeholders):

# API project
vercel env add DATABASE_URL "postgresql://postgres:<PASSWORD>@db.host:5432/postgres?sslmode=require" production --token $VERCEL_TOKEN --project <PROJECT_NAME_API>
vercel env add JWT_SECRET "$(openssl rand -hex 32)" production --token $VERCEL_TOKEN --project <PROJECT_NAME_API>
vercel env add NODE_ENV production production --token $VERCEL_TOKEN --project <PROJECT_NAME_API>
vercel env add FRONTEND_URL "https://<YOUR_WEB_PROJECT_DOMAIN>" production --token $VERCEL_TOKEN --project <PROJECT_NAME_API>
# Optional
vercel env add STRIPE_SECRET_KEY "sk_live_xxx" production --token $VERCEL_TOKEN --project <PROJECT_NAME_API>

# Web project
vercel env add NEXT_PUBLIC_API_URL "/api" production --token $VERCEL_TOKEN --project <PROJECT_NAME_WEB>
# Optional
vercel env add SENTRY_DSN "https://example@sentry.io/12345" production --token $VERCEL_TOKEN --project <PROJECT_NAME_WEB>

If the CLI version you use does not accept inline values (it may prompt for values), run the `vercel env add` commands and paste the values when asked, or set them via the dashboard as described above.

Monorepo / vercel.json notes

- The repository currently has a root `vercel.json` that declares two services. Vercel can deploy multiple services from a monorepo but it's generally simpler to create two separate projects that each point to `apps/web` and `apps/api` respectively.
- If you prefer the single-repo multi-service approach, ensure each Vercel project is created and pointed at the correct directory; and set environment variables per project as above.

If you want, I can:
- Create a small helper script in the repo that prints the exact `vercel env add` commands with placeholders filled (you'll still need to run it locally with your VERCEL_TOKEN), or
- Create per-project `vercel.json` examples in `apps/web` and `apps/api` to make the project roots explicit.

Which of those would you like me to add to the repo now? If you want the helper script, tell me the Vercel project names to include and I will commit it for you.
