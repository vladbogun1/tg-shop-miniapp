"use client";

/** Small pieces shared by the «Переводы» screen. */
import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { TrStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { DiffPart, Issue } from "@/lib/translation-check";
import { KIND_SHORT } from "@/lib/translation-prompt";
import { Button } from "@/components/ui/Button";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Old WebViews / no permission: the textarea trick still works on a user gesture.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CopyButton({
  text,
  label = "Скопировать промпт",
  variant = "accent",
  onCopied,
  copied: copiedProp,
}: {
  text: string;
  label?: string;
  variant?: "accent" | "outline";
  onCopied?: () => void;
  /** Persistent "already copied" mark (parts the admin has taken). */
  copied?: boolean;
}) {
  const [flash, setFlash] = useState(false);
  return (
    <Button
      variant={variant}
      icon={flash ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      onClick={async () => {
        if (await copyText(text)) {
          setFlash(true);
          onCopied?.();
          window.setTimeout(() => setFlash(false), 1600);
        }
      }}
    >
      {flash ? "Скопировано" : copiedProp ? `${label} ещё раз` : label}
    </Button>
  );
}

export function KindBadge({ kindKey }: { kindKey: string }) {
  return (
    <span className="inline-flex items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-3)] px-1.5 py-px text-[10px] font-black uppercase tracking-wide text-[var(--text-muted)]">
      {KIND_SHORT[kindKey] ?? kindKey}
    </span>
  );
}

const STATUS_STYLE: Record<TrStatus, { label: string; cls: string }> = {
  TRANSLATED: { label: "готово", cls: "bg-[var(--ok)] text-[var(--accent-ink)]" },
  STALE: { label: "устарел", cls: "bg-[var(--warn)] text-[var(--accent-ink)]" },
  MISSING: { label: "нет", cls: "bg-[var(--surface-3)] text-[var(--text-muted)]" },
};

export function StatusChip({ lang, status }: { lang: string; status: TrStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--r-sm)] border-2 border-[var(--line)] px-1.5 py-px text-[10px] font-black uppercase tracking-wide",
        s.cls
      )}
    >
      {lang} · {s.label}
    </span>
  );
}

export function ProductLink({ productId, title }: { productId: string; title?: string | null }) {
  return (
    <Link
      href={`/products?edit=${productId}`}
      target="_blank"
      className="inline-flex min-w-0 items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent)]"
      title="Открыть товар в редакторе (новая вкладка)"
    >
      <span className="truncate">{title || "товар"}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </Link>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {issues.map((i, k) => (
        <li
          key={k}
          className={cn(
            "text-[12px] font-semibold leading-snug",
            i.level === "error" ? "text-[var(--danger)]" : "text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]"
          )}
        >
          {i.level === "error" ? "✕ " : "! "}
          {i.text}
        </li>
      ))}
    </ul>
  );
}

export function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--text)]">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "del" ? (
          <del
            key={i}
            className="rounded-[2px] bg-[color-mix(in_srgb,var(--danger)_22%,transparent)] text-[var(--text)] decoration-[var(--danger)] decoration-2"
          >
            {p.text}
          </del>
        ) : (
          <ins
            key={i}
            className="rounded-[2px] bg-[color-mix(in_srgb,var(--ok)_28%,transparent)] font-semibold text-[var(--text)] no-underline"
          >
            {p.text}
          </ins>
        )
      )}
    </div>
  );
}

/** Plain auto-height textarea used inline in tables. */
export function InlineText({
  value,
  onChange,
  invalid,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  ariaLabel: string;
}) {
  const rows = Math.min(10, Math.max(2, value.split("\n").length + Math.floor(value.length / 70)));
  return (
    <textarea
      aria-label={ariaLabel}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "thin-scroll w-full resize-y rounded-[var(--r-md)] border-[2px] bg-[var(--surface)] px-2.5 py-2 text-[13px] leading-relaxed text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]",
        invalid ? "border-[var(--danger)]" : "border-[var(--line)]"
      )}
    />
  );
}

export function SourceText({ text, clamp = true }: { text: string; clamp?: boolean }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260 || text.split("\n").length > 5;
  return (
    <div>
      <div
        className={cn(
          "whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--text)]",
          clamp && long && !open && "line-clamp-5"
        )}
      >
        {text}
      </div>
      {clamp && long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)] hover:text-[var(--accent)]"
        >
          {open ? "Свернуть" : "Показать полностью"}
        </button>
      )}
    </div>
  );
}
