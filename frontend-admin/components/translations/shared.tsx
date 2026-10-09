"use client";

/** Small pieces shared by the «Переводы» screen. */
import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { DiffPart, Issue } from "@/lib/translation-check";
import { STATE_LABEL, type Bucket } from "@/lib/translation-queue";
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
  variant?: "accent" | "outline" | "surface";
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
    <span className="chip-tint !bg-[var(--surface-3)] !px-2 !text-[10px] !leading-[16px]">
      {KIND_SHORT[kindKey] ?? kindKey}
    </span>
  );
}

/** Tinted chips (16% of the hue + text in it), like every status chip in v3. */
const STATE_STYLE: Record<Bucket, { color: string; cls?: string }> = {
  missing: { color: "var(--text-muted)", cls: "!bg-[var(--surface-3)]" },
  stale: { color: "var(--warn)" },
  review: { color: "var(--info)" },
  done: { color: "var(--ok)" },
};

/** State of one language: «uk · нет перевода», «en · устарел», «uk · ИИ, не проверен», «en · готово». */
export function StateChip({ lang, state, className }: { lang?: string; state: Bucket; className?: string }) {
  const s = STATE_STYLE[state];
  return (
    <span
      className={cn("chip-tint !gap-1 !px-2 !text-[10px] !leading-[16px]", s.cls, className)}
      style={{ "--chip": s.color } as CSSProperties}
    >
      {lang && <span className="uppercase">{lang} ·</span>}
      {STATE_LABEL[state]}
    </span>
  );
}

/** Keyboard key hint. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-1.5 py-px font-mono text-[10.5px] font-semibold text-[var(--text-muted)]">
      {children}
    </kbd>
  );
}

export function ProductLink({ productId, title }: { productId: string; title?: string | null }) {
  return (
    <Link
      href={`/products?edit=${productId}`}
      target="_blank"
      className="inline-flex min-w-0 items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent-hi)]"
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
            i.level === "error" ? "text-[var(--danger-ink)]" : "text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]"
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
            className="rounded-[var(--r-sm)] bg-[color-mix(in_srgb,var(--danger)_22%,transparent)] text-[var(--text)] decoration-[var(--danger)] decoration-2"
          >
            {p.text}
          </del>
        ) : (
          <ins
            key={i}
            className="rounded-[var(--r-sm)] bg-[color-mix(in_srgb,var(--ok)_28%,transparent)] font-semibold text-[var(--text)] no-underline"
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
        "thin-scroll w-full resize-y rounded-[var(--r-md)] border bg-[var(--surface-2)] px-2.5 py-2 text-[13px] leading-relaxed text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]",
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
          className="mt-1 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-faint)] hover:text-[var(--accent-hi)]"
        >
          {open ? "Свернуть" : "Показать полностью"}
        </button>
      )}
    </div>
  );
}
