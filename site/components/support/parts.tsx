"use client";

/** Small pieces shared by the support pages. */
import { Info, MessageCircle, Send } from "lucide-react";
import Link from "next/link";
import type { SupportStatus, SupportThread } from "@shop/shared";
import type { TFunction } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { BOT_URL } from "@/lib/config";
import { Image } from "@/lib/image";

/** Product title, else the subject, else «General question». */
export function threadTitle(thread: SupportThread, t: TFunction): string {
  return thread.productTitle?.trim() || thread.subject?.trim() || t("support.general");
}

export function SupportStatusChip({ status }: { status: SupportStatus }) {
  const { t } = useI18n();
  const open = status === "OPEN";
  const color = open ? "var(--ok)" : "var(--faint)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[.08em]"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color: open ? "var(--ok)" : "var(--muted)" }}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {open ? t("support.status.open") : t("support.status.closed")}
    </span>
  );
}

export function SupportDisabled() {
  const { t } = useI18n();
  return (
    <div className="nb flex flex-col items-start gap-3 p-5">
      <p className="flex items-start gap-2 text-[14px] font-medium text-[var(--muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
        {t("support.disabled")}
      </p>
      <a
        href={BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 font-display text-[13px] font-bold uppercase tracking-[.08em] text-[var(--accent-hi)]"
      >
        <Send className="h-4 w-4" strokeWidth={2.25} />
        {t("footer.bot")}
      </a>
    </div>
  );
}

/** Product (or general question) card at the top of a thread / the new-question form. */
export function SupportTopicCard({
  title,
  imageUrl,
  productPath,
  eyebrow,
  children,
}: {
  title: string;
  imageUrl?: string | null;
  /** Locale-less product path; null = not a product thread. */
  productPath: string | null;
  eyebrow: string;
  children?: React.ReactNode;
}) {
  const { t, href } = useI18n();
  return (
    <div className="nb-flat flex items-center gap-3 p-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
        {imageUrl ? (
          <Image imageKey={imageUrl} alt={title} size={120} className="h-full w-full" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[var(--muted)]">
            <MessageCircle className="h-6 w-6" strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-[10px]">{eyebrow}</p>
        {productPath ? (
          <Link
            href={href(productPath)}
            className="line-clamp-2 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--accent-hi)]"
            title={t("support.toProduct")}
          >
            {title}
          </Link>
        ) : (
          <p className="line-clamp-2 text-[15px] font-semibold text-[var(--ink)]">{title}</p>
        )}
        {children}
      </div>
    </div>
  );
}
