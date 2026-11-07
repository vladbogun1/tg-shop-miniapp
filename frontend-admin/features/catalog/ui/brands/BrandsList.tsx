"use client";

import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { hostOf, type BrandSort } from "../../model/brands";
import type { AdminBrand } from "../../model/types";
import { productsWord } from "../../model/words";
import { BrandLogoThumb } from "../BrandLogoField";
import { RowCheck } from "../BulkBar";
import { Aliases, PhoneActions, RowActions } from "./brand-parts";

export interface BrandActions {
  edit: (b: AdminBrand) => void;
  merge: (b: AdminBrand) => void;
  remove: (b: AdminBrand) => void;
}

export interface BrandSelection {
  ids: ReadonlySet<string>;
  toggle: (id: string, on: boolean) => void;
  toggleAll: (on: boolean) => void;
}

export interface BrandSortState {
  key: BrandSort;
  dir: 1 | -1;
  onSort: (key: BrandSort) => void;
}

function SortTh({ label, k, sort, className }: { label: string; k: BrandSort; sort: BrandSortState; className?: string }) {
  const active = sort.key === k;
  const Icon = sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => sort.onSort(k)}
        className={cn("focusable inline-flex items-center gap-1 uppercase", active ? "text-[var(--accent-hi)]" : "hover:text-[var(--text)]")}
      >
        {label}
        {active && <Icon className="h-3 w-3" />}
      </button>
    </th>
  );
}

/** Таблица на ноуте (сортировка по заголовкам, чекбоксы) и компактные карточки на телефоне. */
export function BrandsList({
  brands,
  actions,
  selection,
  sort,
  dupes,
}: {
  brands: AdminBrand[];
  actions: BrandActions;
  selection: BrandSelection;
  sort: BrandSortState;
  /** Бренды из групп возможных дубликатов — помечаются в строке. */
  dupes: ReadonlySet<string>;
}) {
  const all = brands.length > 0 && brands.every((b) => selection.ids.has(b.id));
  const some = brands.some((b) => selection.ids.has(b.id));
  return (
    <>
      <div className="card hidden p-0 md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-10">
                <RowCheck checked={all} indeterminate={some} onChange={selection.toggleAll} label="Выбрать все бренды в списке" />
              </th>
              <th className="w-[96px]">Логотип</th>
              <SortTh label="Бренд" k="name" sort={sort} />
              <SortTh label="Slug" k="slug" sort={sort} />
              <SortTh label="Сайт" k="site" sort={sort} className="hidden xl:table-cell" />
              <SortTh label="Товаров" k="products" sort={sort} className="r" />
              <th>Алиасы</th>
              <th className="r" aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className={cn("group", selection.ids.has(b.id) && "bg-[var(--accent-soft)]")}>
                <td>
                  <RowCheck checked={selection.ids.has(b.id)} onChange={(on) => selection.toggle(b.id, on)} label={`Выбрать «${b.name}»`} />
                </td>
                <td>
                  <button type="button" onClick={() => actions.edit(b)} className="focusable block rounded-[var(--r-sm)]" aria-label={`Логотип ${b.name}: изменить`}>
                    <BrandLogoThumb url={b.logoUrl} mode={b.logoMode} name={b.name} />
                  </button>
                </td>
                <td>
                  <button type="button" onClick={() => actions.edit(b)} className="focusable rounded-[var(--r-sm)] text-left font-semibold text-[var(--text)] hover:text-[var(--accent-hi)]">
                    {b.name}
                  </button>
                  {dupes.has(b.id) && <span className="ml-2 rounded-[var(--r-sm)] bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--warn)]">дубликат?</span>}
                </td>
                <td className="whitespace-nowrap font-mono text-[12px] text-[var(--text-muted)]">{b.slug}</td>
                <td className="hidden xl:table-cell">
                  <SiteLink website={b.website} />
                </td>
                <td className="r">
                  {b.productCount > 0 ? (
                    <Link href={`/products?brand=${b.id}`} className="tabular font-semibold hover:text-[var(--accent-hi)]">
                      {b.productCount}
                    </Link>
                  ) : (
                    <span className="tabular text-[var(--text-faint)]">0</span>
                  )}
                </td>
                <td className="max-w-[320px]">
                  <Aliases list={b.aliases} />
                </td>
                <td className="r whitespace-nowrap">
                  <RowActions onEdit={() => actions.edit(b)} onMerge={() => actions.merge(b)} onDelete={() => actions.remove(b)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {brands.map((b) => (
          <li key={b.id} className={cn("card flex items-center gap-1 p-2", selection.ids.has(b.id) && "border-[var(--accent)]")}>
            <RowCheck checked={selection.ids.has(b.id)} onChange={(on) => selection.toggle(b.id, on)} label={`Выбрать «${b.name}»`} />
            <button type="button" onClick={() => actions.edit(b)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left">
              <BrandLogoThumb url={b.logoUrl} mode={b.logoMode} name={b.name} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-[var(--ink)]">
                  {b.name}
                  {dupes.has(b.id) && <span className="ml-1.5 text-[11px] font-semibold text-[var(--warn)]">дубликат?</span>}
                </span>
                <span className="block truncate font-mono text-[11.5px] text-[var(--text-faint)]">
                  {b.slug} · {productsWord(b.productCount)}
                  {b.website ? ` · ${hostOf(b.website)}` : ""}
                </span>
                {b.aliases.length > 0 && <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{b.aliases.join(", ")}</span>}
              </span>
            </button>
            <PhoneActions title={b.name} onEdit={() => actions.edit(b)} onMerge={() => actions.merge(b)} onDelete={() => actions.remove(b)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function SiteLink({ website }: { website: string | null | undefined }) {
  if (!website) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <a
      href={website.startsWith("http") ? website : `https://${website}`}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--accent-hi)]"
    >
      {hostOf(website)} <ExternalLink className="h-3 w-3" />
    </a>
  );
}
