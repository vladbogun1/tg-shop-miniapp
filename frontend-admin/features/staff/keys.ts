import type { AuditFilter } from "./api";

/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const staffKeys = {
  account: () => ["admin", "account"] as const,
  logins: () => ["admin", "account", "logins"] as const,
  team: () => ["admin", "team"] as const,
  audit: (filter: AuditFilter) => ["audit", filter] as const,
  auditFacets: () => ["audit-facets"] as const,
  invite: (token: string) => ["admin", "invite", token] as const,
  incidents: () => ["incidents"] as const,
};
