"use client";

import { Truck, X } from "lucide-react";
import { MARKDOWN_COLLECTION_SLUG } from "@shop/core/catalog";
import { EMPTY_FILTER } from "@shop/customer/catalog/model/filter";
import { useI18n } from "@/i18n/context";
import { haptic } from "@/platform/telegram";
import { lowerFirst } from "../model/sort";
import { Chip, DragScroll } from "./HomeBits";
import type { HomeState } from "./use-home";

/** Root categories (+ pre-order / markdown), the children of the active root, and the active filter chips. */
export function CategoryRows({ h }: { h: HomeState }) {
  const { t } = useI18n();
  const { roots, hasMarkdown, hasPre, category, selectCategory, activeRoot, children, onlyPre, setOnlyPre, activeChips, setFilter } = h;
  return (
    <>
            {(roots.length > 0 || hasMarkdown || hasPre) && (
              <DragScroll className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-0.5">
                <Chip active={category === null} onClick={() => selectCategory(null)}>
                  {t("catalog.allTags")}
                </Chip>
                {roots.map((c) => (
                  <Chip key={c.id} active={activeRoot?.id === c.id} onClick={() => selectCategory(c.slug)}>
                    {c.name}
                  </Chip>
                ))}
                {hasPre && (
                  <Chip active={onlyPre} onClick={() => { haptic(); setOnlyPre((v) => !v); }}>
                    <span className="inline-flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" strokeWidth={2.5} />
                      {t("preorder.filter")}
                    </span>
                  </Chip>
                )}
                {hasMarkdown && (
                  <Chip active={category === MARKDOWN_COLLECTION_SLUG} onClick={() => selectCategory(MARKDOWN_COLLECTION_SLUG)}>
                    {t("catalog.markdown")}
                  </Chip>
                )}
              </DragScroll>
            )}
      
            {activeRoot && children.length > 0 && (
              <DragScroll className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
                <Chip small active={category === activeRoot.slug} onClick={() => selectCategory(activeRoot.slug)}>
                  {t("catalog.allIn", { name: lowerFirst(activeRoot.name) })}
                </Chip>
                {children.map((c) => (
                  <Chip key={c.id} small active={category === c.slug} onClick={() => selectCategory(c.slug)}>
                    {c.name}
                  </Chip>
                ))}
              </DragScroll>
            )}
      
            {activeChips.length > 0 && (
              <DragScroll className="no-scrollbar -mx-4 mt-2 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5">
                {activeChips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={t("catalog.filter.remove", { name: c.label })}
                    onClick={() => {
                      haptic();
                      setFilter((f) => c.remove(f));
                    }}
                    className="nb-press inline-flex min-h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] py-1 pl-2.5 pr-1.5 text-[12px] font-semibold text-[var(--accent-hi)]"
                  >
                    {c.label}
                    <X className="h-3.5 w-3.5" strokeWidth={2.75} />
                  </button>
                ))}
                {activeChips.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      setFilter((f) => ({ ...EMPTY_FILTER, category: f.category ?? null }));
                    }}
                    className="min-h-[30px] shrink-0 whitespace-nowrap px-2 text-[12px] font-semibold text-[var(--muted)] underline underline-offset-2"
                  >
                    {t("catalog.filter.resetAll")}
                  </button>
                )}
              </DragScroll>
            )}
    </>
  );
}
