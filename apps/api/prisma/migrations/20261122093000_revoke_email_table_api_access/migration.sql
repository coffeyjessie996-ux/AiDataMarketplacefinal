REVOKE ALL PRIVILEGES ON TABLE
  "GmailConnection",
  "GmailOAuthState",
  "OutboundEmail",
  "EmailSuppression",
  "EmailSendQuota"
FROM anon, authenticated, PUBLIC;