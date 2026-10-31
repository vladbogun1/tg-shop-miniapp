"use client";

/** «Мої очікування» (docs/PREORDERS-PLAN.md §4.4): my places in queues with their status and the next step. */
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@shop/ui/primitives";
import { toast } from "@shop/ui/toast";
import { useI18n } from "@/i18n/context";
import { Image } from "@/lib/image";
import { cardEtaLine, holdUntilText, isLive, type MyPreorder, MY_PREORDERS_KEY, preorderApi, useMyPreorders } from "@/features/preorder";

export function Waitlist() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useMyPreorders();
  const live = data.filter((m) => isLive(m.status));
  const past = data.filter((m) => !isLive(m.status));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer h-24" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="nb flex flex-col items-start gap-3 p-6">
        <p className="text-[15px] font-semibold text-[var(--danger)]">{t("preorder.account.error")}</p>
        <Button variant="accent" size="sm" onClick={() => void refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="nb hud-frame flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Bell className="h-10 w-10 text-[var(--pre)]" strokeWidth={1.75} />
        <p className="font-display text-[18px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">{t("preorder.account.empty.title")}</p>
        <p className="max-w-sm text-[14px] font-medium text-[var(--muted)]">{t("preorder.account.empty.text")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {live.length > 0 && (
        <ul className="flex flex-col gap-3">
          {live.map((m) => (
            <Row key={m.id} m={m} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="eyebrow mb-3 text-[11px]">{t("preorder.account.history")}</h2>
          <ul className="flex flex-col gap-3">
            {past.map((m) => (
              <Row key={m.id} m={m} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type TFn = ReturnType<typeof useI18n>["t"];

/** Status line, its colour and the one action that makes sense for a place in a queue. */
function rowStatus(m: MyPreorder, t: TFn, locale: ReturnType<typeof useI18n>["locale"]) {
  switch (m.status) {
    case "HELD":
      return {
        status: m.holdUntil ? t("preorder.account.held", { when: holdUntilText(m.holdUntil, locale) }) : t("preorder.notified"),
        tone: "var(--ok)",
        action: "buy" as "buy" | "again" | null,
      };
    case "NOTIFIED":
      return { status: t("preorder.notified"), tone: "var(--ok)", action: "buy" as "buy" | "again" | null };
    case "WAITING":
      return {
        status: m.position ? t("preorder.account.waiting", { n: m.position }) : t("preorder.queue.inShort", { q: m.qty }),
        tone: "var(--pre)",
        action: null as "buy" | "again" | null,
      };
    case "BOUGHT":
      return { status: t("preorder.account.bought"), tone: "var(--muted)", action: null as "buy" | "again" | null };
    case "EXPIRED":
      return { status: t("preorder.account.expired"), tone: "var(--warn)", action: "again" as "buy" | "again" | null };
    default:
      return { status: t("preorder.account.cancelled"), tone: "var(--muted)", action: null as "buy" | "again" | null };
  }
}

function Row({ m }: { m: MyPreorder }) {
  const { t, href, locale } = useI18n();
  const qc = useQueryClient();
  const [leaving, setLeaving] = useState(false);
  const url = href(`/product/${m.productSlug}`);
  const live = isLive(m.status);

  async function leave() {
    setLeaving(true);
    try {
      await preorderApi.leave(m.id);
      await qc.invalidateQueries({ queryKey: MY_PREORDERS_KEY });
      toast.success(t("preorder.queue.left"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("preorder.error.generic"));
    } finally {
      setLeaving(false);
    }
  }

  // status line + colour, then the one action that makes sense
  const { status, tone, action } = rowStatus(m, t, locale);
  const eta = live && m.status === "WAITING" && m.eta ? cardEtaLine(m.eta, t, locale) : null;

  return (
    <li className={`nb-flat flex gap-3 p-3 sm:gap-4 sm:p-4 ${live ? "" : "opacity-80"}`}>
      <Link href={url} className="block h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)] sm:h-20 sm:w-20" tabIndex={-1} aria-hidden>
        <Image src={m.imageUrl} alt="" size={200} className="h-full w-full" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link href={url} className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--ink)] hover:text-[var(--accent-hi)]">
          {m.productTitle}
          {m.variantName ? ` · ${m.variantName}` : ""}
        </Link>
        <p className="text-[13px] font-bold [overflow-wrap:anywhere]" style={{ color: tone }}>
          {status}
          <span className="font-medium text-[var(--muted)]"> · {t("preorder.account.qty", { q: m.qty })}</span>
        </p>
        {eta && <p className="text-[12px] font-medium text-[var(--muted)]">{eta}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {action === "buy" && (
            <Link href={url} className="nb-accent nb-press tap nb-up inline-flex min-h-10 items-center px-4 text-[13px]">
              {t("preorder.account.buy")}
            </Link>
          )}
          {action === "again" && (
            <Link href={url} className="tap inline-flex min-h-10 items-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 text-[13px] font-semibold text-[var(--ink)]">
              {t("preorder.account.again")}
            </Link>
          )}
          {live && (
            <button
              type="button"
              onClick={() => void leave()}
              disabled={leaving}
              className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-[var(--muted)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--danger)] disabled:opacity-60"
            >
              {leaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {t("preorder.queue.leave")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
