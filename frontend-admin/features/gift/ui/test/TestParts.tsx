"use client";

/** Parts of «Тест кейса»: a prize picture, the card of a single opening, a tile of a ×N run, a row of the stats table. */
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { CASE_RARITY_COLOR, caseDiscountText, type CaseItem } from "@shop/core/giftcase";
import { formatNumber } from "@shop/core/money";
import { cn } from "@/lib/cn";
import { Button } from "@shop/ui/admin-button";
import { resolveImageSrc } from "@/lib/image";
import { money } from "@/lib/money";
import { CASE_RARITY_LABEL } from "../../model/labels";
import { itemTitle, pct, toCaseItem, type StatLine, type TestStats } from "../../model/test-stats";

export const caseImage = (src: string, size: number) => resolveImageSrc(src, size);

function PrizeThumb({ item, size }: { item: CaseItem; size: number }) {
  if (item.kind === "DISCOUNT") {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-2)] font-display text-[11px] font-bold leading-none"
        style={{ width: size, height: size, color: CASE_RARITY_COLOR[item.rarity] }}
        aria-hidden
      >
        {caseDiscountText(item, money)}
      </span>
    );
  }
  return item.imageUrl ? (
    <img
      src={caseImage(item.imageUrl, size * 2)}
      alt=""
      className="shrink-0 rounded-[var(--r-sm)] bg-[var(--surface-2)] object-contain"
      style={{ width: size, height: size }}
      draggable={false}
    />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-2)]" style={{ width: size, height: size }} aria-hidden>
      🎁
    </span>
  );
}

/** The prize of a single fast opening. */
export function DropCard({ item }: { item: CaseItem }) {
  const c = CASE_RARITY_COLOR[item.rarity];
  return (
    <motion.div
      initial={{ scale: 0.92 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 20 }}
      className="card-2 flex min-w-0 items-center gap-3 p-2.5"
      style={{ borderColor: c, boxShadow: `0 0 18px color-mix(in srgb, ${c} 30%, transparent)` }}
    >
      <PrizeThumb item={item} size={56} />
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: c }}>
          {CASE_RARITY_LABEL[item.rarity]}
        </div>
        <div className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-[var(--ink)]">{itemTitle(item)}</div>
        {item.kind === "PRODUCT" && item.priceMinor > 0 && <div className="tabular text-[12px] text-[var(--text-muted)]">{money(item.priceMinor)}</div>}
      </div>
    </motion.div>
  );
}

/** A draw of a ×N run. */
export function DropTile({ item }: { item: CaseItem }) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-[var(--r-sm)] border-b-[3px] bg-[var(--surface-2)] p-1"
      style={{ borderBottomColor: CASE_RARITY_COLOR[item.rarity] }}
      title={`${itemTitle(item)} · ${CASE_RARITY_LABEL[item.rarity]}`}
    >
      <div className="grid place-items-center">
        <PrizeThumb item={item} size={44} />
      </div>
    </div>
  );
}

export function StatRow({ row, max }: { row: StatLine; max: number }) {
  const item = row.it ? toCaseItem(row.it) : null;
  const rarity = row.it?.rarity ?? "COMMON";
  const c = CASE_RARITY_COLOR[rarity];
  return (
    <li className="card-2 min-w-0 px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {item ? <PrizeThumb item={item} size={34} /> : <span className="h-[34px] w-[34px] shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-[var(--ink)]">{item ? itemTitle(item) : `Приз #${row.id}`}</div>
          <div className="text-[11px] font-semibold leading-tight" style={{ color: c }}>
            {CASE_RARITY_LABEL[rarity]}
          </div>
        </div>
        <div className="shrink-0 text-right leading-tight">
          <div className={cn("tabular text-[13px] font-bold", row.odd ? "text-[var(--warn)]" : "text-[var(--ink)]")}>{pct(row.fact, 2)} %</div>
          <div className="tabular text-[11px] text-[var(--text-faint)]">
            {formatNumber(row.hits, "ru-RU")} · шанс {pct(row.chance)} %
          </div>
        </div>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(row.fact / max) * 100}%`, background: c }} />
        <div className="absolute inset-y-[-2px] w-[2px] bg-[var(--ink)]" style={{ left: `calc(${Math.min(100, (row.chance / max) * 100)}% - 1px)` }} />
      </div>
    </li>
  );
}

/** The latest run's drops: one prize as a card, a ×N run as tiles. */
export function LastRun({ shown }: { shown: { run: number; drops: CaseItem[]; count: number } | null }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {shown && (
        <motion.div
          key={shown.run}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-3 min-w-0"
        >
          <div className="mb-1.5 text-[12px] text-[var(--text-faint)]">
            {shown.count === 1
              ? "Выпало:"
              : `Последний прогон ×${formatNumber(shown.count, "ru-RU")}${shown.count > shown.drops.length ? `, первые ${shown.drops.length}` : ""}:`}
          </div>
          {shown.count === 1 && shown.drops[0] ? (
            <DropCard item={shown.drops[0]} />
          ) : (
            <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
              {shown.drops.map((d, i) => (
                <DropTile key={i} item={d} />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The session's table: how many times each prize dropped against its chance. */
export function StatsSection({
  stats,
  rows,
  max,
  disabled,
  onReset,
}: {
  stats: TestStats;
  rows: StatLine[];
  max: number;
  disabled: boolean;
  onReset: () => void;
}) {
  return (
    <>
      <div className="mt-4 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 font-display text-[14px] font-bold text-[var(--ink)]">
          Статистика теста · <span className="tabular">{formatNumber(stats.n, "ru-RU")}</span> откр.
        </div>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} disabled={stats.n === 0 || disabled} onClick={onReset}>
          Сбросить
        </Button>
      </div>
      {stats.n === 0 ? (
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--text-muted)]">
          Откройте кейс — здесь появится, сколько раз выпал каждый приз и его доля против настроенного шанса.
        </p>
      ) : (
        <>
          <ul className="mt-2 flex min-w-0 flex-col gap-1.5">
            {rows.map((r) => (
              <StatRow key={r.id} row={r} max={max} />
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-snug text-[var(--text-faint)]">
            «Шанс» — фактический шанс приза среди тех, что могут выпасть (вес / сумма весов). Полоса — доля в тесте, риска — шанс.
            Жёлтым — отклонение больше 3σ (при 100+ открытиях; иногда бывает и случайно).
          </p>
        </>
      )}
    </>
  );
}
