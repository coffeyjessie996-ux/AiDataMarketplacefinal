-- Supabase Data API hardening for the marketplace tables.
--
-- The application authenticates users with its own Express/JWT layer and accesses
-- PostgreSQL through Prisma. It does not set Supabase Auth JWT claims on database
-- sessions, so per-user Supabase policies cannot safely be inferred here.
--
-- Enable RLS on every public table. This blocks access through Supabase's exposed
-- anon/authenticated roles unless an explicit policy is added. The Express API's
-- DATABASE_URL must use a trusted backend database role that owns these tables or
-- has BYPASSRLS (for example, the Supabase postgres/service role). Verify that
-- connection role before applying this migration; do not expose DATABASE_URL or
-- privileged credentials to the browser.
--
-- No permissive policies are added intentionally. Public/client access must be
-- designed separately around the application's actual authorization model.

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WalletAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Dataset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Listing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WalletTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupplierResearchRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Payout" ENABLE ROW LEVEL SECURITY;
