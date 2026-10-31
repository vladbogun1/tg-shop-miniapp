"use client";

import { motion } from "framer-motion";
import { PackageOpen, Search, WifiOff } from "lucide-react";
import { EMPTY_FILTER } from "@shop/customer/catalog/model/filter";
import { ProductCard, ProductCardSkeleton } from "@/features/catalog";
import { PreorderRibbon } from "@/features/preorders";
import { useI18n } from "@/i18n/context";
import { spring } from "@/lib/motion";
import { haptic } from "@/platform/telegram";
import { EmptyState, NbButton } from "./HomeBits";
import type { HomeState } from "./use-home";

/** Cards that rise in on mount — a first screenful; the rest just appear. */
const ANIMATED_CARDS = 6;

/** Grid of product cards and the loading / error / empty states. */
export function HomeList({ h }: { h: HomeState }) {
  const { t } = useI18n();
  const { isLoading, isError, refetch, isRefetching, products, sorted, setSearch, setFilter, showRibbon, ribbonProducts, coming, setSelected, setOnlyPre, summaries, compareGroups, preStates, token, setNotifyFor } = h;
  return (
    <div className="pt-5">
          {isLoading && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          )}
      
          {isError && (
            <EmptyState
              icon={<WifiOff className="h-9 w-9" strokeWidth={2.5} />}
              title={t("catalog.error.title")}
              text={t("catalog.error.text")}
            >
              <NbButton onClick={() => refetch()} loading={isRefetching}>{t("common.retry")}</NbButton>
            </EmptyState>
          )}
      
          {!isLoading && !isError && products.length === 0 && (
            <EmptyState
              icon={<PackageOpen className="h-9 w-9" strokeWidth={2.5} />}
              title={t("catalog.empty.titleApp")}
              text={t("catalog.empty.textApp")}
            />
          )}
      
          {!isLoading && !isError && products.length > 0 && sorted.length === 0 && (
            <EmptyState
              icon={<Search className="h-9 w-9" strokeWidth={2.5} />}
              title={t("catalog.noResults.title")}
              text={t("catalog.noResults.text")}
            >
              <NbButton onClick={() => { setSearch(""); setFilter(EMPTY_FILTER); }}>{t("catalog.resetFilters")}</NbButton>
            </EmptyState>
          )}
      
          {showRibbon && (
            <PreorderRibbon
              products={ribbonProducts}
              coming={coming}
              onOpen={setSelected}
              onAll={() => {
                haptic();
                setOnlyPre(true);
                window.scrollTo({ top: 0 });
              }}
            />
          )}
      
          {!isLoading && !isError && sorted.length > 0 && (
            // No `key` on the grid: re-keying it per filter used to remount all ~216 cards and replay
            // a 0.05 s stagger over every one of them (~10 s of spring animations, mostly off
            // screen) on each chip tap. On iPhones that kept the main thread busy long enough for the
            // next taps to be lost — prod data showed 4× more repeated chip taps than on Android.
            // Now cards keep their identity across filters and only the first screenful animates in.
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              {sorted.map((p, i) =>
                i < ANIMATED_CARDS ? (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 16, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: 0.03 + i * 0.04 } }}
                    className="catalog-cell flex"
                  >
                    <ProductCard product={p} onOpen={setSelected} summary={summaries.get(p.id)} compareGroup={compareGroups.get(p.id)} preorder={preStates.get(p.id)} onNotify={token ? setNotifyFor : undefined} />
                  </motion.div>
                ) : (
                  <div key={p.id} className="catalog-cell flex">
                    <ProductCard product={p} onOpen={setSelected} summary={summaries.get(p.id)} compareGroup={compareGroups.get(p.id)} preorder={preStates.get(p.id)} onNotify={token ? setNotifyFor : undefined} />
                  </div>
                ),
              )}
            </div>
          )}
    </div>
  );
}
