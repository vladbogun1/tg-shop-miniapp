"use client";

/**
 * Строка товара. Одна сетка на все ширины (см. ROW_GRID):
 *  - телефон: фото · название с отметками · «на витрине» и «⋯»; ниже две «пилюли» — цена и остаток (тап = правка в шторке);
 *  - 640–1023: фото · название · цена · остаток · витрина · «⋯» в одной строке;
 *  - от 1024 — таблица с галочкой выбора; от 1536 добавляются «Категория», «Бренд», «Продано», «Карточка».
 * Клик по строке открывает редактор; цена и остаток правятся на месте (QuickCell), «⋯» — остальные действия.
 */
import { WaitBadge } from "@/features/procurement";
import { useShopSetting } from "@/features/settings";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { hasVariantStock } from "../../model/quick-edit";
import { toMajor } from "@/lib/money";
import { effStock } from "../../model/stock";
import type { AdminProduct as Product } from "../../model/types";
import { Check } from "./Check";
import { CardMarks, PriceTag } from "./RowBits";
import { QuickCell } from "./QuickCell";
import { RowActions } from "./RowActions";
import { ROW_GRID } from "./row-grid";

export interface RowProps {
  p: Product;
  /** Required characteristics without a value. */
  missing: number;
  archivedView: boolean;
  /** Название категории (колонка от 1536 px). */
  categoryName: string;
  selected: boolean;
  /** Идёт выбор (что-то отмечено или включён режим): галочка видна и на телефоне. */
  selecting: boolean;
  onSelect: (on: boolean) => void;
  onComplete: () => void;
  onEdit: () => void;
  onActive: (v: boolean) => void;
  onArchive: (a: boolean) => void;
  savePrice: (raw: string) => Promise<boolean>;
  saveStock: (raw: string) => Promise<boolean>;
}

function StockValue({ p }: { p: Product }) {
  const stock = effStock(p);
  const lowQty = useShopSetting("catalog.lowStockQty", 3);
  const out = p.active !== false && stock === 0;
  const low = stock > 0 && stock <= lowQty;
  return (
    <span className={cn("tabular font-semibold", out && "text-[var(--danger-ink)]", low && "text-[var(--warn)]")}>
      {stock} <span className="font-normal text-[var(--text-faint)]">шт</span>
    </span>
  );
}

function StockFlag({ p }: { p: Product }) {
  const stock = effStock(p);
  const lowQty = useShopSetting("catalog.lowStockQty", 3);
  if (p.active !== false && stock === 0) return <Badge tone="danger">Закончился</Badge>;
  if (stock > 0 && stock <= lowQty) return <Badge tone="warn">Мало: {stock}</Badge>;
  return null;
}

/** Метки под названием: закончился/мало, ожидание поставки, варианты; бренд, продано и карточка — пока для них нет колонок. */
function RowMeta({ p, missing }: { p: Product; missing: number }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[var(--text-muted)]">
      <StockFlag p={p} />
      <WaitBadge productId={p.id} title={p.title} />
      {p.variants && p.variants.length > 0 && <span className="tabular">{p.variants.length} вар.</span>}
      {(p.soldCount ?? 0) > 0 && <span className="tabular 2xl:hidden">продано {p.soldCount}</span>}
      {p.brandRef?.name && <span className="truncate 2xl:hidden">{p.brandRef.name}</span>}
      <span className="contents 2xl:hidden">
        <CardMarks p={p} missing={missing} />
      </span>
    </div>
  );
}

/** Фото; на телефоне при выборе — галочка поверх него. */
function Thumb({ p, selected, showCheck, onSelect }: { p: Product; selected: boolean; showCheck: boolean; onSelect: (on: boolean) => void }) {
  return (
    <div className="relative">
      <Image src={p.images?.[0]?.url} alt={p.title} size={120} className="h-12 w-12 shrink-0 rounded-[var(--r-md)] border border-[var(--line)] sm:h-14 sm:w-14" />
      {showCheck && (
        <span className="absolute -left-1 -top-1 grid place-items-center rounded-[var(--r-sm)] bg-[var(--surface)] lg:hidden" onClick={(e) => e.stopPropagation()}>
          <Check checked={selected} onChange={onSelect} label={`Выбрать ${p.title}`} />
        </span>
      )}
    </div>
  );
}

/** От 1536 px: колонки вместо меток под названием. */
function WideColumns({ p, missing, categoryName }: { p: Product; missing: number; categoryName: string }) {
  return (
    <>
      <span className="hidden truncate text-[12.5px] text-[var(--text-muted)] 2xl:order-[10] 2xl:block" title={categoryName}>
        {categoryName}
      </span>
      <span className="hidden truncate text-[12.5px] text-[var(--text-muted)] 2xl:order-[11] 2xl:block">{p.brandRef?.name ?? ""}</span>
      <span className="tabular hidden text-[12.5px] text-[var(--text-muted)] 2xl:order-[12] 2xl:block">{(p.soldCount ?? 0) > 0 ? p.soldCount : ""}</span>
      <span className="hidden flex-wrap items-center gap-1 2xl:order-[13] 2xl:flex">
        <CardMarks p={p} missing={missing} />
      </span>
    </>
  );
}

/** Цена и остаток: правка на месте (в архиве — только показ). */
function PriceStock({ p, archivedView, onEdit, savePrice, saveStock }: Pick<RowProps, "p" | "archivedView" | "onEdit" | "savePrice" | "saveStock">) {
  const stockLocked = hasVariantStock(p);
  return (
    <div className="col-span-2 col-start-2 flex items-center gap-2 sm:contents" onClick={(e) => e.stopPropagation()}>
      <div className="sm:order-[20] sm:justify-self-end">
        {archivedView ? (
          <PriceTag p={p} />
        ) : (
          <QuickCell label="Цена" subject={p.title} display={<PriceTag p={p} />} initial={p.priceMinor > 0 ? String(toMajor(p.priceMinor)) : ""} inputMode="decimal" suffix="₴" onSave={savePrice} />
        )}
      </div>
      <div className="sm:order-[21] sm:justify-self-end">
        {archivedView ? (
          <StockValue p={p} />
        ) : (
          <QuickCell
            label="Остаток"
            subject={p.title}
            display={<StockValue p={p} />}
            initial={String(p.stock ?? 0)}
            inputMode="numeric"
            suffix="шт"
            onSave={saveStock}
            locked={stockLocked ? { hint: "Остаток считается по вариантам — откройте товар", onOpen: onEdit } : undefined}
          />
        )}
      </div>
    </div>
  );
}

export function ProductRow(props: RowProps) {
  const { p, missing, archivedView, categoryName, selected, selecting, onSelect, onComplete, onEdit, onActive, onArchive } = props;
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  const editable = !archivedView;
  return (
    <div
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? onEdit : undefined}
      onKeyDown={(e) => {
        if (editable && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "card grid items-center gap-x-3 gap-y-2 p-3 [content-visibility:auto] [contain-intrinsic-size:auto_76px]",
        ROW_GRID,
        editable && "card-hover cursor-pointer",
        selected && "!border-[rgba(255,102,0,.45)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]",
        danger && !selected && "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
      )}
    >
      <span className="hidden lg:grid lg:place-items-center" onClick={(e) => e.stopPropagation()}>
        {editable && <Check checked={selected} onChange={onSelect} label={`Выбрать ${p.title}`} />}
      </span>
      <Thumb p={p} selected={selected} showCheck={editable && selecting} onSelect={onSelect} />

      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 min-w-0 break-words text-[14px] font-semibold leading-snug text-[var(--text)] sm:line-clamp-1">{p.title}</h3>
          {!p.active && editable && <Badge tone="warn">скрыт</Badge>}
        </div>
        <RowMeta p={p} missing={missing} />
      </div>

      <WideColumns p={p} missing={missing} categoryName={categoryName} />

      {/* Телефон: переключатель и меню — справа от названия; цена и остаток — второй строкой. */}
      <div className="flex items-center gap-2 sm:contents" onClick={(e) => e.stopPropagation()}>
        {editable ? (
          <div className="flex items-center justify-center sm:order-[22]" title="Показывать на сайте и в Mini App">
            <Toggle checked={!!p.active} onChange={onActive} />
          </div>
        ) : (
          <span aria-hidden className="hidden sm:order-[22] sm:block" />
        )}
        <div className="sm:order-[23] sm:justify-self-end">
          <RowActions p={p} archivedView={archivedView} onEdit={onEdit} onComplete={onComplete} onArchive={onArchive} />
        </div>
      </div>

      <PriceStock p={p} archivedView={archivedView} onEdit={onEdit} savePrice={props.savePrice} saveStock={props.saveStock} />
    </div>
  );
}
