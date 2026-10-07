"use client";

/**
 * «Сегодня» — the strip above the orders board: what needs doing now and how today is going.
 * Self-contained (own query, own styles) so the board only renders <TodayStrip />.
 * Every counter is a link: to the board filtered by status, to dispatch, or to the metrics tabs.
 *
 * Board deep links used here: `/?status=NEW` and `/?payment=paid` (paid online, still NEW) — the
 * board reads those query parameters; without that support the links simply open the board.
 */
import { cn } from "@/lib/cn";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Hourglass, PackageCheck, Send, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import "./metrics.css";
import { metricsApi, type Today } from "./api";
import { num, uahShort } from "./format";

export function TodayStrip() {
  const q = useQuery({
    queryKey: ["metrics2", "today"],
    queryFn: () => metricsApi.today(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (q.isError) {
    return (
      <div className="mb-4 text-[12px] text-[var(--text-faint)]">
        Сводка «Сегодня» не загрузилась.{" "}
        <button type="button" className="font-bold underline" onClick={() => q.refetch()}>
          Повторить
        </button>
      </div>
    );
  }
  if (!q.data) {
    return <div className="mb-4 h-[76px] shimmer" aria-busy="true" aria-label="Загружаем сводку" />;
  }
  return <Strip t={q.data} />;
}

function Strip({ t }: { t: Today }) {
  const soonTitles = t.reorderTop.map((r) => (r.variantName ? `${r.title} (${r.variantName})` : r.title)).join(", ");
  return (
    <div className="mx-root mb-4">
      <div className="thin-scroll -mx-1 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[760px] grid-cols-7 gap-2">
          <Cell href="/?status=NEW" icon={Hourglass} label="К одобрению" value={num(t.toApprove)} alert={t.toApprove > 0} />
          <Cell href="/dispatch" icon={Send} label="К отправке" value={num(t.toShip)} alert={t.toShip > 0} />
          <Cell
            href="/?payment=paid"
            icon={CircleDollarSign}
            label="Оплачены — подтвердить"
            value={num(t.awaitingPaymentConfirm)}
            alert={t.awaitingPaymentConfirm > 0}
            sub="оплачены онлайн, ещё новые"
          />
          <Cell
            href="/metrics?tab=overview"
            icon={TrendingUp}
            label="Продано сегодня"
            value={uahShort(t.soldTodayMinor)}
            sub={<Compare now={t.soldTodayMinor} then={t.soldYesterdaySameTimeMinor} label={`вчера к часу: ${uahShort(t.soldYesterdaySameTimeMinor)}`} />}
          />
          <Cell
            href="/metrics?tab=overview"
            icon={Wallet}
            label="Получено сегодня"
            value={uahShort(t.receivedTodayMinor)}
            sub={`вчера ${uahShort(t.receivedYesterdayMinor)}`}
          />
          <Cell
            href="/metrics?tab=stock"
            icon={PackageCheck}
            label="Заканчиваются"
            value={num(t.runningOut)}
            alert={t.runningOut > 0}
            sub={t.runningOut > 0 ? "за ≤ 14 дн — что дозаказать" : "в ближайшие 14 дн — ничего"}
            title={soonTitles}
          />
          <Cell
            href="/metrics?tab=overview"
            icon={TrendingUp}
            label="Прогноз месяца"
            value={`≈ ${uahShort(t.monthForecast.totalMinor)}`}
            sub={`${uahShort(t.monthForecast.lowMinor)} – ${uahShort(t.monthForecast.highMinor)}`}
          />
        </div>
      </div>
    </div>
  );
}

function Compare({ now, then, label }: { now: number; then: number; label: string }) {
  if (then <= 0) return <>{label}</>;
  const up = now >= then;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="h-3 w-3 shrink-0" strokeWidth={3} style={{ color: up ? "var(--mx-up)" : "var(--mx-down)" }} />
      {label}
    </span>
  );
}

function Cell({
  href,
  icon: Icon,
  label,
  value,
  sub,
  alert,
  title,
}: {
  href: string;
  icon: typeof Send;
  label: string;
  value: string;
  sub?: ReactNode;
  alert?: boolean;
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        "nb-press card card-hover relative flex min-w-0 flex-col gap-1.5 overflow-hidden p-3",
        alert && "!border-[rgba(255,102,0,.4)]"
      )}
    >
      {/* Something waits on the owner: orange hairline on top + orange icon (not colour alone — the number says it). */}
      {alert && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-[var(--accent)] shadow-[var(--glow-sm)]" />}
      <span className="font-display flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", alert && "text-[var(--accent)]")} /> {label}
      </span>
      <span className="kpi-num truncate text-[20px]">{value}</span>
      {sub && <span className="truncate text-[11px] text-[var(--text-faint)]">{sub}</span>}
    </Link>
  );
}
