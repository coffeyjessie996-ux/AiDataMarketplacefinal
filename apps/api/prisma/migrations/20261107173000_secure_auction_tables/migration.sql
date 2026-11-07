ALTER TABLE public."Auction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuctionBid" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."Auction" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."AuctionBid" FROM anon, authenticated;
