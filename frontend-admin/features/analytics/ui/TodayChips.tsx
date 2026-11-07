"use client";

/**
 * «Сегодня» as one line of chips above the orders board (the old strip was a 110px block of seven
 * tiles). What waits on the owner (to approve / to ship / paid to confirm / running out) shows only
 * when it is above zero, orange; sales and money received are always there. «Сводка» unfolds the
 * full strip (forecast, yesterday's comparison). `trailing` is the board's own chip («Хотят купить»).
 * On a phone the line scrolls sideways inside itself; from tablet up it wraps.
 */
import { CircleDollarSign, ChevronDown, Hourglass, PackageCheck, Send, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { localStore } from "@shop/core/storage";
import { cn } from "@/lib/cn";
import "./metrics.css";
import { num, uahShort } from "../model/format";
import type { Today } from "../model/types";
import { useTodayMetrics } from "../queries";
import { Compare, Strip } from "./TodayStrip";

const OPEN_KEY = "orders.summary.open";

export const CHIP_CLASS =
  "nb-press inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:h-10";

function Chip({ href, icon: Icon, label, value, alert, title, extra }: { href: string; icon: typeof Send; label: string; value: string; alert?: boolean; title?: string; extra?: ReactNode }) {
  return (
    <Link href={href} title={title} className={cn(CHIP_CLASS, alert && "!border-[rgba(255,102,0,.45)] !bg-[var(--accent-soft)] !text-[var(--text)]")}>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", alert && "text-[var(--accent)]")} />
      <span className="font-display text-[11px] uppercase tracking-[0.06em]">{label}</span>
      <span className={cn("tabular text-[13px] font-bold", alert ? "text-[var(--accent-hi)]" : "text-[var(--text)]")}>{value}</span>
      {extra}
    </Link>
  );
}

function Chips({ t }: { t: Today }) {
  const soonTitles = t.reorderTop.map((r) => (r.variantName ? `${r.title} (${r.variantName})` : r.title)).join(", ");
  return (
    <>
      {t.toApprove > 0 && (
        <Chip
          href="/?status=NEW"
          icon={Hourglass}
          label="К одобрению"
          value={num(t.toApprove)}
          alert
          title={t.awaitingPayment > 0 ? `ещё ${num(t.awaitingPayment)} ждут онлайн-оплаты` : undefined}
          extra={t.awaitingPayment > 0 && <span className="tabular text-[11.5px] font-medium text-[var(--text-muted)]">+{num(t.awaitingPayment)} ждут оплаты</span>}
        />
      )}
      {t.toShip > 0 && <Chip href="/dispatch" icon={Send} label="К отправке" value={num(t.toShip)} alert />}
      {t.awaitingPaymentConfirm > 0 && (
        <Chip href="/?payment=paid" icon={CircleDollarSign} label="Оплачены" value={num(t.awaitingPaymentConfirm)} alert title="Оплачены онлайн, ещё новые — подтвердить" />
      )}
      {t.runningOut > 0 && <Chip href="/metrics?tab=stock" icon={PackageCheck} label="Заканчиваются" value={num(t.runningOut)} alert title={soonTitles} />}
      <Chip
        href="/metrics?tab=overview"
        icon={TrendingUp}
        label="Продано"
        value={uahShort(t.soldTodayMinor)}
        extra={<Compare now={t.soldTodayMinor} then={t.soldYesterdaySameTimeMinor} label="" />}
        title={`Вчера к этому часу: ${uahShort(t.soldYesterdaySameTimeMinor)}`}
      />
      <Chip
        href="/metrics?tab=overview"
        icon={Wallet}
        label="Получено"
        value={uahShort(t.receivedTodayMinor)}
        extra={<span className="tabular text-[11.5px] font-medium text-[var(--text-faint)]">вчера {uahShort(t.receivedYesterdayMinor)}</span>}
        title={`Вчера: ${uahShort(t.receivedYesterdayMinor)}`}
      />
    </>
  );
}

export function TodayChips({ trailing }: { trailing?: ReactNode }) {
  const q = useTodayMetrics();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStore.getItem(OPEN_KEY) === "1");
    } catch {
      /* storage blocked — folded */
    }
  }, []);
  function toggle() {
    setOpen((v) => {
      try {
        localStore.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }

  return (
    <div className="mx-root mb-3">
      {/* Phone: the line scrolls sideways; the fading right edge says there is more of it. */}
      <div className="thin-scroll -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,#000_88%,transparent)] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 md:[mask-image:none]">
        {q.isError ? (
          <span className="text-[12px] text-[var(--text-faint)]">
            Сводка «Сегодня» не загрузилась.{" "}
            <button type="button" className="font-bold underline" onClick={() => q.refetch()}>
              Повторить
            </button>
          </span>
        ) : q.data ? (
          <Chips t={q.data} />
        ) : (
          <span className="shimmer h-9 w-64 rounded-full" aria-busy="true" aria-label="Загружаем сводку" />
        )}
        {trailing}
        {q.data && (
          <button type="button" onClick={toggle} aria-expanded={open} className={cn(CHIP_CLASS, "md:ml-auto")}>
            Сводка
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
          </button>
        )}
      </div>
      {open && q.data && <Strip t={q.data} />}
    </div>
  );
}
