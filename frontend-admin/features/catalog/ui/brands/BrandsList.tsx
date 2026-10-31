"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { riseItem, staggerContainer } from "@/lib/motion";
import { hostOf } from "../../model/brands";
import type { AdminBrand } from "../../model/types";
import { productsWord } from "../../model/words";
import { BrandLogoThumb } from "../BrandLogoField";
import { Aliases, RowActions } from "./brand-parts";

export interface BrandActions {
  edit: (b: AdminBrand) => void;
  merge: (b: AdminBrand) => void;
  remove: (b: AdminBrand) => void;
}

/** Таблица на десктопе и карточки на телефоне. */
export function BrandsList({ brands, actions }: { brands: AdminBrand[]; actions: BrandActions }) {
  return (
    <>
      {/* Desktop: table */}
      <div className="card hidden overflow-hidden p-0 md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-[96px]">Логотип</th>
              <th>Бренд</th>
              <th>Slug</th>
              <th>Сайт</th>
              <th className="r">Товаров</th>
              <th>Алиасы</th>
              <th className="r" aria-label="Действия" />
            </tr>
          </thead>
          <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
            {brands.map((b) => (
              <motion.tr key={b.id} variants={riseItem} className="group">
                <td>
                  <button type="button" onClick={() => actions.edit(b)} className="focusable block rounded-[var(--r-sm)]" aria-label={`Логотип ${b.name}: изменить`}>
                    <BrandLogoThumb url={b.logoUrl} mode={b.logoMode} name={b.name} />
                  </button>
                </td>
                <td>
                  <button type="button" onClick={() => actions.edit(b)} className="focusable rounded-[var(--r-sm)] text-left font-semibold text-[var(--text)] hover:text-[var(--accent-hi)]">
                    {b.name}
                  </button>
                </td>
                <td className="font-mono text-[12px] text-[var(--text-muted)]">{b.slug}</td>
                <td>
                  {b.website ? (
                    <a
                      href={b.website.startsWith("http") ? b.website : `https://${b.website}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--accent-hi)]"
                    >
                      {hostOf(b.website)} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-[var(--text-faint)]">—</span>
                  )}
                </td>
                <td className="r">
                  {b.productCount > 0 ? (
                    <Link href={`/products?brand=${b.id}`} className="font-semibold hover:text-[var(--accent-hi)]">
                      {b.productCount}
                    </Link>
                  ) : (
                    <span className="text-[var(--text-faint)]">0</span>
                  )}
                </td>
                <td className="max-w-[320px]">
                  <Aliases list={b.aliases} />
                </td>
                <td className="r whitespace-nowrap">
                  <RowActions onEdit={() => actions.edit(b)} onMerge={() => actions.merge(b)} onDelete={() => actions.remove(b)} />
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>

      {/* Phone: cards */}
      <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2.5 md:hidden">
        {brands.map((b) => (
          <motion.li key={b.id} variants={riseItem} className="card p-3">
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => actions.edit(b)} className="flex min-w-0 items-center gap-2.5 text-left">
                <BrandLogoThumb url={b.logoUrl} mode={b.logoMode} name={b.name} />
                <span className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-[var(--ink)]">{b.name}</div>
                  <div className="truncate font-mono text-[11.5px] text-[var(--text-faint)]">
                    {b.slug}
                    {b.website ? ` · ${hostOf(b.website)}` : ""}
                  </div>
                </span>
              </button>
              <span className="tabular shrink-0 text-[13px] font-semibold text-[var(--text-muted)]">{productsWord(b.productCount)}</span>
            </div>
            {b.aliases.length > 0 && (
              <div className="mt-2">
                <Aliases list={b.aliases} />
              </div>
            )}
            <div className="mt-2 flex justify-end border-t border-[var(--line)] pt-2">
              <RowActions onEdit={() => actions.edit(b)} onMerge={() => actions.merge(b)} onDelete={() => actions.remove(b)} />
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </>
  );
}
