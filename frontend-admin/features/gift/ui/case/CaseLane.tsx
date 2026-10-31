"use client";

import { useEffect, useState } from "react";
import { Lock, Package, Percent } from "lucide-react";
import { CASE_RARITY_COLOR, type CaseRarity } from "@shop/core/giftcase";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { canDrop, fmtPct, parsePct, type Row, type Summary } from "../../model/case-draft";
import { CASE_RARITY_LABEL } from "../../model/labels";
import { DiscountBadge } from "./PrizeParts";

/** One rarity of the board: its share, the add buttons and the prizes. */
export function CaseLane({
  rarity,
  rows,
  sum,
  onShare,
  onOpen,
  onAddProduct,
  onAddDiscount,
}: {
  rarity: CaseRarity;
  rows: Row[];
  sum: Summary;
  onShare: (percent: number) => void;
  onOpen: (key: string) => void;
  onAddProduct: () => void;
  onAddDiscount: () => void;
}) {
  const color = CASE_RARITY_COLOR[rarity];
  const share = sum.share[rarity];
  const live = rows.some(canDrop);
  return (
    <section
      className="card-2 min-w-0 border-l-[3px] p-2.5"
      style={{ borderLeftColor: color, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 7%, transparent), transparent 40%)` }}
      aria-label={CASE_RARITY_LABEL[rarity]}
    >
      <header className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span className="min-w-0 truncate font-display text-[13.5px] font-bold" style={{ color }}>
          {rarity === "GOLD" ? "Джекпот" : CASE_RARITY_LABEL[rarity]}
        </span>
        <span className="tabular text-[12px] text-[var(--text-faint)]">{rows.length}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {live && <ShareInput value={share} onCommit={onShare} />}
          <LaneBtn label="Добавить товар" onClick={onAddProduct}>
            <Package className="h-4 w-4" />
          </LaneBtn>
          <LaneBtn label="Добавить скидку" onClick={onAddDiscount}>
            <Percent className="h-4 w-4" />
          </LaneBtn>
        </div>
      </header>
      {rows.length > 0 && (
        <ul className="mt-2 grid min-w-0 grid-cols-1 gap-1.5 xl:grid-cols-2">
          {rows.map((r) => (
            <PrizeRow key={r.key} r={r} chance={sum.chance.get(r.key) ?? 0} perMonth={sum.perMonth.get(r.key) ?? 0} onOpen={() => onOpen(r.key)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PrizeRow({ r, chance, perMonth, onOpen }: { r: Row; chance: number; perMonth: number; onOpen: () => void }) {
  const isProduct = r.kind === "PRODUCT";
  const cantDrop = isProduct && (r.stock <= 0 || !r.productActive);
  const short = isProduct && !cantDrop && perMonth > r.stock;
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "focusable flex w-full min-w-0 items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-1.5 pr-2.5 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
          !r.active && "opacity-55"
        )}
      >
        {isProduct ? (
          <Image
            src={r.imageUrl ?? undefined}
            alt={r.title}
            size={80}
            className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
          />
        ) : (
          <DiscountBadge row={r} size={40} />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            {r.locked && <Lock className="h-3 w-3 shrink-0 text-[var(--text-faint)]" aria-label="Закреплён" />}
            <span className="line-clamp-1 break-all text-[13px] font-semibold leading-snug text-[var(--text)]">{r.title}</span>
          </span>
          <PrizeMeta r={r} warn={cantDrop || short} />
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("tabular block font-display text-[14px] font-bold leading-tight", chance > 0 ? "text-[var(--ink)]" : "text-[var(--text-faint)]")}>
            {fmtPct(chance)} %
          </span>
          {perMonth >= 0.05 && <span className="tabular block text-[10.5px] leading-tight text-[var(--text-faint)]">≈{fmtPct(perMonth, 1)}/мес</span>}
        </span>
      </button>
    </li>
  );
}

/** Price and stock of a product prize (red when it can't drop or won't last the month), «промокод» for a discount. */
function PrizeMeta({ r, warn }: { r: Row; warn: boolean }) {
  const off = !r.active && " · выкл";
  return (
    <span className="tabular block truncate text-[11.5px] leading-snug text-[var(--text-faint)]">
      {r.kind === "PRODUCT" ? (
        <>
          {money(r.priceMinor)} · <span className={warn ? "font-semibold text-[var(--danger-ink)]" : undefined}>{stockLabel(r)}</span>
          {off}
        </>
      ) : (
        <>промокод{off}</>
      )}
    </span>
  );
}

function stockLabel(r: Row): string {
  if (!r.productActive) return "скрыт";
  return r.stock <= 0 ? "нет в наличии" : `${r.stock} шт`;
}

/** A rarity's total chance, editable: the prizes inside keep their proportions, the other rarities make room. */
function ShareInput({ value, onCommit }: { value: number; onCommit: (p: number) => void }) {
  const [raw, setRaw] = useState(fmtPct(value));
  useEffect(() => setRaw(fmtPct(value)), [value]);
  const parsed = parsePct(raw);
  return (
    <label className="flex items-center gap-1" title="Доля редкости, %: призы внутри сохраняют пропорции, остальные редкости подвинутся">
      <input
        inputMode="decimal"
        aria-label="Доля редкости, %"
        aria-invalid={parsed === null || undefined}
        value={raw}
        onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))}
        onBlur={() => (parsed === null ? setRaw(fmtPct(value)) : Math.abs(parsed - value) > 0.005 && onCommit(parsed))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setRaw(fmtPct(value));
        }}
        className={cn(
          "tabular focusable h-8 w-[64px] rounded-[var(--r-sm)] border bg-[var(--surface-2)] px-1.5 text-center text-[13px] font-semibold text-[var(--text)] pointer-coarse:h-9",
          parsed === null ? "border-[var(--danger)]" : "border-[var(--line)]"
        )}
      />
      <span className="text-[12px] text-[var(--text-faint)]">%</span>
    </label>
  );
}

function LaneBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="focusable hit grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] pointer-coarse:h-9 pointer-coarse:w-9"
    >
      {children}
    </button>
  );
}
