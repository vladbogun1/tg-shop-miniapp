"use client";

/**
 * SHOP catalog — ChiSetup (v3). Tap → ProductView. Sorting: out-of-stock always sink to the bottom;
 * default orders by bestseller (soldCount). A sort menu sits next to search. Tag row supports
 * mouse drag + wheel horizontal scroll on desktop.
 */
import { toast } from "@shop/ui/toast";
import { filterForCategory } from "@shop/core/catalog";
import { EMPTY_FILTER } from "@shop/customer/catalog/model/filter";
import { FilterSheet } from "@/features/catalog";
import { CompareSheet, CompareToastHost } from "@/features/compare";
import { NotificationsBell } from "@/features/notifications";
import { PreorderSheet, queuedFor } from "@/features/preorders";
import { ProductView } from "@/features/product";
import { useI18n } from "@/i18n/context";
import { LanguageToggle } from "@/shell/LanguageToggle";
import { Logo } from "@/shell/Logo";
import { CategoryRows } from "./CategoryRows";
import { HomeList } from "./HomeList";
import { SearchRow } from "./SearchRow";
import { useHome } from "./use-home";

export function HomeScreen() {
  const { t } = useI18n();
  const h = useHome();
  const { selected, setSelected, search, setSearch, filter, setFilter, filtersOpen, setFiltersOpen, notifyFor, setNotifyFor, coming, mine, schema, items, category, showControls } = h;
  const fireToast = (msg: string) => toast.success(msg, { duration: 1800 });

  return (
    <div className="min-h-full" style={{ marginTop: "calc(-1 * max(16px, var(--safe-top)))" }}>
      {/* ── HEADER ─────────────────────────────────────────────────────────
          Only the controls (search · sort · categories) stick. The brand row above them scrolls
          away with the list — it cost ~70px of a phone screen on every scroll position. Neither
          part changes height, so the list never jumps. */}
      <div
        className="-mx-4 px-4 pb-1"
        style={{ paddingTop: "max(12px, var(--safe-top))", background: "rgba(14,14,16,.86)" }}
      >
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {/* Same wordmark as the website header — one identity across site and Telegram. */}
            <h1 className="leading-none" aria-label="ChiSetup">
              <Logo size="lg" />
            </h1>
            <p className="mt-1.5 truncate text-[12px] font-medium text-[var(--muted)]">
              {t("catalog.tagline")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationsBell />
            <LanguageToggle />
          </div>
        </header>
      </div>

      {/* ── STICKY CONTROLS ──────────────────────────────────────────────
          They stick just under the safe area (Telegram fullscreen: status bar + its buttons), which a
          fixed strip of header colour covers — padding them by --safe-top instead doubled that gap
          under the brand row while nothing was scrolled yet. */}
      {/* Opaque on purpose: under Telegram's fullscreen buttons (Закрыть · ⌄ · ⋮) the scrolled brand row
          showed through a translucent strip and looked like it slid under the buttons. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-30"
        style={{ height: "var(--safe-top)", background: "var(--bg)" }}
      />
      <div
        className="sticky z-30 -mx-4 border-b border-[var(--line)] px-4 pb-2.5 pt-2 backdrop-blur-[12px]"
        style={{ top: "var(--safe-top)", background: "rgba(14,14,16,.86)" }}
      >
        {showControls && (
          <>
            <SearchRow h={h} />
            <CategoryRows h={h} />
          </>
        )}
      </div>

      {/* ── GRID / STATES ──────────────────────────────────────────────── */}
      <HomeList h={h} />

      <ProductView
        product={selected}
        onClose={() => setSelected(null)}
        onAdded={() => fireToast(t("catalog.addedToast"))}
        onCategory={(slug) => {
          setSearch("");
          setFilter((f) => filterForCategory(f, slug));
          setSelected(null);
          window.scrollTo({ top: 0 });
        }}
        onBrand={(slug) => {
          setSearch("");
          setFilter({ ...EMPTY_FILTER, brands: [slug] });
          setSelected(null);
          window.scrollTo({ top: 0 });
        }}
      />
      <FilterSheet
        open={filtersOpen}
        schema={schema}
        items={items}
        filter={{ ...filter, category }}
        q={search}
        onApply={(f) => {
          setFilter(f);
          setFiltersOpen(false);
        }}
      />
      <CompareSheet
        schema={schema}
        onOpenProduct={setSelected}
        onBrowse={(slug) => {
          setSearch("");
          setFilter((f) => filterForCategory(f, slug));
          window.scrollTo({ top: 0 });
        }}
      />
      <PreorderSheet
        product={notifyFor}
        variant={null}
        mine={notifyFor ? queuedFor(mine, notifyFor.id, null) : undefined}
        coming={!!notifyFor && !!coming.productEta(notifyFor.id)}
        holdHours={notifyFor ? coming.holdHoursOf(notifyFor.id) : undefined}
        open={!!notifyFor}
        onClose={() => setNotifyFor(null)}
        onDone={fireToast}
      />
      <CompareToastHost />
    </div>
  );
}
