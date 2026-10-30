import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { AuditEntry } from "../api";
import { AUDIT_RISKY, auditActionLabel, auditEntityHref, auditEntityLabel } from "../model/audit-labels";

export function auditWho(e: AuditEntry): string {
  if (e.adminId === 0) return "—";
  return e.adminName || `#${e.adminId}`;
}

export function ActionBadge({ code }: { code: string }) {
  return <Badge tone={AUDIT_RISKY.has(code) ? "danger" : code.startsWith("ADMIN_LOGIN") ? "info" : "neutral"}>{auditActionLabel(code)}</Badge>;
}

export function EntityCell({ e }: { e: AuditEntry }) {
  const href = auditEntityHref(e.entityType, e.entityId);
  const id = e.entityId ? (e.entityId.length > 12 ? `#${e.entityId.slice(0, 8)}` : e.entityId) : null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--text-muted)]")}>
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em]">{auditEntityLabel(e.entityType)}</span>
      {id &&
        (href ? (
          <Link href={href} className="hit inline-flex items-center gap-0.5 font-mono text-[var(--accent-hi)] hover:underline">
            {id}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="font-mono">{id}</span>
        ))}
    </span>
  );
}
