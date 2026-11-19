REVOKE ALL PRIVILEGES ON TABLE
  public."AgentTaskRun",
  public."Lead",
  public."LeadActivity",
  public."SupplierResearchRecord"
FROM PUBLIC, anon, authenticated;
