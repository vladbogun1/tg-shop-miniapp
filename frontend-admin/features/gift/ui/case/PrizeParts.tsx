"use client";

/** Parts of the prize editor: the header, the chance and discount fields, the list of replacements, the discount badge. */
import { useEffect, useState } from "react";
import { Lock, Package } from "lucide-react";
import { CASE_RARITY_COLOR, type CaseTier } from "@shop/core/giftcase";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { Button } from "@shop/ui/admin-button";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { fmtPct, parsePct, type Row } from "../../model/case-draft";
import { CASE_RARITY_LABEL } from "../../model/labels";
import type { DraftItem } from "../../model/types";
import { useAlternativesQuery } from "../../queries";

export function DiscountBadge({ row, size }: { row: Pick<Row, "rarity" | "discountPercent" | "discountUah">; size: number }) {
  const color = CASE_RARITY_COLOR[row.rarity];
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[var(--r-sm)] font-display font-extrabold leading-none text-white"
      style={{
        width: size,
        height: size,
        fontSize: size >= 48 ? 13 : 10.5,
        background: `linear-gradient(135deg, color-mix(in srgb, ${color} 85%, #fff), color-mix(in srgb, ${color} 70%, #000))`,
      }}
    >
      {row.discountPercent > 0 ? `−${row.discountPercent}%` : `−${row.discountUah}₴`}
    </span>
  );
}

/** Why a product prize can't drop right now (null = it can). */
function stockNote(row: Row): string {
  if (!row.productActive) return "товар скрыт — не выпадет";
  return row.stock <= 0 ? "нет в наличии — не выпадет" : `${row.stock} шт`;
}

/** The prize's picture, rarity, title, price / stock and the expected drops a month. */
export function PrizeHeader({ row, perMonth }: { row: Row; perMonth: number }) {
  const isProduct = row.kind === "PRODUCT";
  const cantDrop = isProduct && (row.stock <= 0 || !row.productActive);
  return (
    <div className="flex min-w-0 items-start gap-3">
      {isProduct ? (
        <Image
          src={row.imageUrl ?? undefined}
          alt={row.title}
          size={120}
          className="h-14 w-14 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
        />
      ) : (
        <DiscountBadge row={row} size={56} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: CASE_RARITY_COLOR[row.rarity] }}>
          {CASE_RARITY_LABEL[row.rarity]}
        </div>
        <div className="break-words text-[14px] font-semibold leading-snug text-[var(--ink)]">{row.title}</div>
        <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
          {isProduct ? (
            <>
              {money(row.priceMinor)} · <span className={cantDrop ? "font-semibold text-[var(--danger-ink)]" : undefined}>{stockNote(row)}</span>
            </>
          ) : (
            "промокод на следующий заказ"
          )}
          {perMonth > 0 && <> · ≈ {fmtPct(perMonth, 1)} в месяц</>}
        </div>
      </div>
    </div>
  );
}

/** The prize's real chance, %: typed, applied on blur / Enter (the others make room). */
export function ChanceField({
  rowKey,
  chance,
  disabled,
  onChance,
}: {
  rowKey: string;
  chance: number;
  disabled: boolean;
  onChance: (percent: number) => void;
}) {
  const [raw, setRaw] = useState("");
  useEffect(() => setRaw(fmtPct(chance, 4)), [chance, rowKey]);
  const parsed = parsePct(raw);
  const commit = () => {
    if (parsed === null) setRaw(fmtPct(chance, 4));
    else if (Math.abs(parsed - chance) > 0.00005) onChance(parsed);
  };
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="field-label">Шанс, %</span>
      <input
        inputMode="decimal"
        aria-label="Шанс, %"
        aria-invalid={parsed === null || undefined}
        value={raw}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setRaw(fmtPct(chance, 4));
        }}
        className={cn(
          "tabular focusable h-10 min-w-0 rounded-[var(--r-md)] border bg-[var(--surface-2)] px-2.5 text-[14px] text-[var(--text)] pointer-coarse:h-11",
          parsed === null ? "border-[var(--danger)]" : "border-[var(--line)]"
        )}
      />
      <span className="text-[11.5px] leading-snug text-[var(--text-faint)]">Остальные призы подвинутся, сумма останется 100 %</span>
    </label>
  );
}

/** Size of a discount prize: a number + «%» / «₴» (one of the two). */
export function DiscountField({ row, onPatch }: { row: Row; onPatch: (patch: Partial<Row>) => void }) {
  const unit: "%" | "₴" = row.discountPercent > 0 ? "%" : "₴";
  const value = unit === "%" ? row.discountPercent : row.discountUah;
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const n = Number(raw);
  const max = unit === "%" ? 50 : 100_000;
  const bad = !raw || !Number.isInteger(n) || n < 1 || n > max;
  const send = (u: "%" | "₴", v: number) =>
    onPatch(u === "%" ? { discountPercent: v, discountUah: 0, title: `Скидка ${v} %` } : { discountPercent: 0, discountUah: v, title: `Скидка ${v} ₴` });
  return (
    <div className="flex min-w-0 flex-col gap-1 min-[420px]:col-span-2">
      <span className="field-label">Скидка на следующий заказ</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          inputMode="numeric"
          aria-label="Размер скидки"
          aria-invalid={bad || undefined}
          value={raw}
          onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onBlur={() => (bad ? setRaw(String(value)) : n !== value && send(unit, n))}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setRaw(String(value));
          }}
          className={cn(
            "tabular focusable h-10 w-[96px] rounded-[var(--r-md)] border bg-[var(--surface-2)] px-2 text-center text-[14px] text-[var(--text)] pointer-coarse:h-11",
            bad ? "border-[var(--danger)]" : "border-[var(--line)]"
          )}
        />
        <Select<"%" | "₴">
          className="w-[80px]"
          value={unit}
          options={[
            { value: "₴", label: "₴" },
            { value: "%", label: "%" },
          ]}
          onChange={(u) => {
            if (u === unit) return;
            // switching the unit keeps a sensible number: 10 % ↔ 100 ₴
            send(u, u === "%" ? Math.min(50, Math.max(1, Math.round(value / 10))) : Math.max(1, value * 10));
          }}
        />
      </div>
    </div>
  );
}

/** «Приз разыгрывается» and «Закрепить» (kept by «Автособрать»). */
export function PrizeSwitches({ row, onPatch }: { row: Row; onPatch: (patch: Partial<Row>) => void }) {
  return (
    <div className="mt-4 flex min-w-0 flex-col gap-2.5">
      <Toggle checked={row.active} onChange={(v) => onPatch({ active: v })} label="Приз разыгрывается" />
      <div className="flex min-w-0 items-center gap-2">
        <Toggle checked={!!row.locked} onChange={(v) => onPatch({ locked: v })} label="Закрепить" />
        <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" aria-hidden />
        <span className="min-w-0 text-[12px] leading-snug text-[var(--text-faint)]">«Автособрать» его не тронет</span>
      </div>
    </div>
  );
}

function AlternativeButton({ a, onPick }: { a: DraftItem; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="card-2 flex min-w-0 shrink-0 items-center gap-2.5 p-2 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
    >
      <Image
        src={a.imageUrl ?? undefined}
        alt={a.title}
        size={80}
        className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
      />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-[13px] font-semibold text-[var(--text)]">{a.title}</span>
        <span className="tabular block text-[11.5px] text-[var(--text-faint)]">
          {money(a.priceMinor)} · {a.stock} шт{a.category ? ` · ${a.category}` : ""}
        </span>
      </span>
    </button>
  );
}

/** «Заменить на похожий по цене»: the server's alternatives of the same rarity, or a pick from the whole catalog. */
export function ReplacePanel({
  open,
  tier,
  row,
  usedProducts,
  onReplace,
  onCatalog,
}: {
  open: boolean;
  tier: CaseTier;
  row: Row;
  usedProducts: string[];
  onReplace: (item: DraftItem) => void;
  onCatalog: () => void;
}) {
  const alt = useAlternativesQuery(tier, row.rarity, usedProducts, open);
  const list = alt.data ?? [];
  return (
    <div className="mt-4 min-w-0 border-t border-[var(--line)] pt-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="field-label">Заменить на похожий по цене</span>
        <Button size="sm" variant="ghost" icon={<Package className="h-3.5 w-3.5" />} onClick={onCatalog}>
          Из каталога
        </Button>
      </div>
      {alt.isLoading ? (
        <p className="mt-2 text-[12.5px] text-[var(--text-faint)]">Подбираем…</p>
      ) : list.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-[var(--text-faint)]">Подходящих по цене товаров нет — выберите из каталога.</p>
      ) : (
        <div className="thin-scroll mt-2 flex max-h-[240px] min-w-0 flex-col gap-1.5 overflow-auto">
          {list.slice(0, 12).map((a) => (
            <AlternativeButton key={a.productId} a={a} onPick={() => onReplace({ ...a, rarity: row.rarity, weight: row.weight })} />
          ))}
        </div>
      )}
    </div>
  );
}
