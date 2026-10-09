# AI Data Marketplace — deployment

## 1. Supabase
Create/use the Supabase PostgreSQL database for this project. Set the API service environment variable `DATABASE_URL` to the Supabase connection string. Do not commit the database password.

Expected shape:

`postgresql://postgres:<DATABASE_PASSWORD>@db.iyilhiotnbgyhexvbnbj.supabase.co:5432/postgres?sslmode=require`

## 2. Vercel
This repository is configured for Vercel Services: one Next.js web service and one Express API service. Vercel routes `/api/*` to the API and everything else to the web service.

Set these environment variables for the API service:

- `DATABASE_URL` — Supabase PostgreSQL connection string
- `JWT_SECRET` — long random secret
- `NODE_ENV=production`
- `FRONTEND_URL` — the deployed web origin if CORS is needed outside the same-domain route
- `STRIPE_SECRET_KEY` — only when real Stripe payouts are enabled

The web service can use the default `NEXT_PUBLIC_API_URL=/api`.

## 3. Database
From the repository root after installing dependencies:

```bash
npm run prisma:generate --workspace @ai-data-marketplace/api
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
npm run prisma:seed --workspace @ai-data-marketplace/api
```

Use `migrate deploy`, not `migrate dev`, for production.

## 4. Production notes
- Authentication now uses bcrypt password hashing and signed JWTs.
- Password hashes are not returned by API responses.
- The old localhost/demo authentication fallback was removed.
- The scraper uses standard `fetch` so the API does not require a browser runtime.
- Stripe payout functions are still simulated; connect a real payout flow before accepting real money.
- Replace the seeded demo credentials before production use.
