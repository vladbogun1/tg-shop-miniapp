"use client";

/**
 * Product cards (route "/cards") — docs/CATALOG-SPECS.md §4–5. The typed characteristics, brand,
 * category and texts of a product are filled by ANY external AI with web search; the admin
 * reviews them here. One screen:
 *  - three tabs by the card status: «Оформить» (DRAFT) · «Проверить» (AI_FILLED) · «Готово» (READY),
 *    a storefront filter, search; «только неполные» in «Готово»;
 *  - «Оформить с ИИ (N)» — the batch wizard (AiCards) for the checked rows, else the current tab;
 *  - a click on a row opens the review panel (what the last import changed, before → after);
 *  - «Принять выбранные» — bulk accept of sure cards (≥ 90 %, nothing required missing).
 * A DRAFT card is not published without an explicit «Выложить без оформления» (409 CARD_NOT_READY).
 */
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, ClipboardCheck, PartyPopper, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { assignCardIds } from "@/lib/card-prompt";
import { cardsApi } from "@/lib/cards-api";
import { invalidateCards, useCardItems, useCatalogSchema } from "@/lib/cards";
import {
  BULK_ACCEPT_MIN,
  bulkAcceptable,
  cardsWord,
  matchesQuery,
  matchesVitrine,
  missingCount,
  productsWord,
  sortForTab,
  TAB_LABEL,
  tabOf,
  type CardTab,
  type Vitrine,
} from "@/lib/cards-view";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { useMediaQuery } from "@/lib/use-media";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toggle } from "@/components/ui/Toggle";
import { AiWizardLayer } from "@/components/cards/AiWizardLayer";
import { CardCompletionModal } from "@/components/cards/CardCompletionModal";
import { CardList } from "@/components/cards/CardList";
import { ReviewPanel } from "@/components/cards/ReviewPanel";

const PAGE = 100;

const EMPTY: Record<CardTab, { title: string; description: string }> = {
  draft: { title: "Всё оформлено", description: "Черновиков нет: у каждого товара есть карточка от ИИ или проверенная." },
  review: { title: "Нечего проверять", description: "Карточки от ИИ появятся здесь после «Оформить с ИИ»." },
  ready: { title: "Пока нет проверенных", description: "Принятые карточки будут здесь." },
};

export default function CardsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const itemsQ = useCardItems();
  const schemaQ = useCatalogSchema();
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const schema = schemaQ.data;
  // Ids over ALL products: the same product keeps its "p…" id whatever is selected.
  const ids = useMemo(() => assignCardIds(items.map((i) => i.id)), [items]);

  const [tab, setTab] = useState<CardTab | null>(null);
  const [vitrine, setVitrine] = useState<Vitrine>("work");
  const [query, setQuery] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [completing, setCompleting] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ open: boolean; preselect: string[]; label: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const phone = useMediaQuery("(max-width: 639px)", false);

  const byVitrine = useMemo(() => items.filter((i) => matchesVitrine(i, vitrine)), [items, vitrine]);
  const counts = useMemo(() => {
    const c: Record<CardTab, number> = { draft: 0, review: 0, ready: 0 };
    for (const i of byVitrine) c[tabOf(i)]++;
    return c;
  }, [byVitrine]);
  // First visit: open on the tab with work (review first — it is the quickest win).
  const current: CardTab = tab ?? (counts.review > 0 ? "review" : counts.draft > 0 ? "draft" : "ready");

  const list = useMemo(
    () =>
      sortForTab(
        byVitrine.filter((i) => tabOf(i) === current && matchesQuery(i, query) && (!onlyIncomplete || current !== "ready" || missingCount(i) > 0)),
        current
      ),
    [byVitrine, current, query, onlyIncomplete]
  );
  const incompleteReady = useMemo(() => byVitrine.filter((i) => tabOf(i) === "ready" && missingCount(i) > 0).length, [byVitrine]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // The selection lives within what is listed: switching tab / filter drops what left the list.
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(list.map((i) => i.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [list]);

  const selectedItems = useMemo(() => list.filter((i) => selected.has(i.id)), [list, selected]);
  const bulkOk = useMemo(() => selectedItems.filter(bulkAcceptable), [selectedItems]);
  const wizardIds = selected.size ? selectedItems.map((i) => i.id) : list.map((i) => i.id);

  function switchTab(t: CardTab) {
    setTab(t);
    setLimit(PAGE);
    setSelected(new Set());
  }

  function openWizard() {
    if (!wizardIds.length) return;
    setWizard({
      open: true,
      preselect: wizardIds,
      label: selected.size ? `отмеченные: ${wizardIds.length}` : `вкладка «${TAB_LABEL[current]}»: ${wizardIds.length}`,
    });
  }

  // ---- panel navigation: by the list as it is now --------------------------------
  const index = openId ? list.findIndex((i) => i.id === openId) : -1;
  const openItem = openId ? (itemById.get(openId) ?? null) : null;
  const neighbour = useCallback(
    (step: 1 | -1) => {
      if (index < 0) return null;
      const n = list[index + step];
      return n ? () => setOpenId(n.id) : null;
    },
    [index, list]
  );
  function afterDone() {
    // The card has left this tab: show the next one (or the previous at the end of the list).
    const next = index >= 0 ? (list[index + 1] ?? list[index - 1] ?? null) : null;
    setOpenId(next ? next.id : null);
  }

  async function bulkAccept() {
    if (!bulkOk.length || bulkBusy) return;
    const skipped = selectedItems.length - bulkOk.length;
    const ok = await confirm({
      title: `Принять ${bulkOk.length} ${cardsWord(bulkOk.length)} без просмотра?`,
      message: (
        <div className="flex flex-col gap-2">
          <p>
            Это карточки от ИИ с уверенностью {BULK_ACCEPT_MIN} % и выше, где заполнены все обязательные характеристики. Они уйдут в «Готово» и
            запишутся как проверенные вами.
          </p>
          {skipped > 0 && (
            <p className="text-[var(--text-faint)]">
              Ещё {skipped} из выбранных не подходят (уверенность ниже {BULK_ACCEPT_MIN} %, не хватает полей или не из «Проверить») — их нужно открыть и
              посмотреть.
            </p>
          )}
        </div>
      ),
      confirmLabel: `Принять ${bulkOk.length}`,
    });
    if (!ok) return;
    setBulkBusy(true);
    let done = 0;
    try {
      for (const it of bulkOk) {
        await cardsApi.accept(it.id, { ready: true });
        done++;
      }
      push(`Принято ${done} ${cardsWord(done)} — они в «Готово»`, "ok");
    } catch {
      push(`Принято ${done} из ${bulkOk.length}, дальше ошибка — попробуйте ещё раз`, "error");
    } finally {
      setBulkBusy(false);
      setSelected(new Set());
      invalidateCards(qc);
    }
  }

  const fetching = itemsQ.isFetching || schemaQ.isFetching;

  return (
    <div>
      <PageHeader
        title="Карточки"
        subtitle="Характеристики, бренд, категория и тексты товаров — их заполняет ИИ с поиском в интернете, вы проверяете. Черновик не выкладывается на витрину без явного «Выложить без оформления»."
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Обновить"
              title="Обновить"
              icon={<RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
              onClick={() => {
                itemsQ.refetch();
                schemaQ.refetch();
              }}
            />
            <Button
              variant="accent"
              chamfer
              icon={<Sparkles className="h-4 w-4" />}
              disabled={!wizardIds.length || !schema}
              onClick={openWizard}
              title={selected.size ? "Оформить отмеченные товары" : `Оформить все товары вкладки «${TAB_LABEL[current]}»`}
            >
              Оформить с ИИ ({wizardIds.length})
            </Button>
          </>
        }
      />

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl<CardTab>
          size={phone ? "sm" : "md"}
          value={current}
          onChange={switchTab}
          options={(["draft", "review", "ready"] as const).map((t) => ({ value: t, label: TAB_LABEL[t], count: counts[t] }))}
        />
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[var(--ring-accent)] sm:w-[240px] sm:flex-none pointer-coarse:h-11">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Поиск"
              title="Поиск по названию, бренду, категории"

              aria-label="Поиск карточек"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            />
            {query && (
              <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")} className="focusable rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--text)]">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select<Vitrine>
            className="w-[170px] shrink-0"
            value={vitrine}
            onChange={(v) => {
              setVitrine(v);
              setLimit(PAGE);
            }}
            options={[
              { value: "work", label: "В работе" },
              { value: "all", label: "Все, со старыми" },
              { value: "live", label: "На витрине" },
              { value: "hidden", label: "Скрытые" },
            ]}
          />
        </div>
      </div>

      {current === "ready" && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--text-muted)]">
          <Toggle checked={onlyIncomplete} onChange={setOnlyIncomplete} label={`Только неполные (${incompleteReady})`} />
          <span className="text-[var(--text-faint)]">— проверены, но не хватает обязательных характеристик</span>
        </div>
      )}

      {/* bulk bar */}
      <AnimatePresence initial={false}>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] border border-[rgba(255,102,0,.35)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] px-3 py-2 shadow-[var(--shadow-2)] backdrop-blur"
          >
            <span className="text-[13px] font-semibold text-[var(--text)]">
              Выбрано {selected.size} {productsWord(selected.size)}
            </span>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Снять выбор
            </Button>
            {current === "review" && (
              <Button
                size="sm"
                variant="surface"
                icon={<CheckCheck className="h-4 w-4" />}
                loading={bulkBusy}
                disabled={!bulkOk.length}
                onClick={bulkAccept}
                title={
                  bulkOk.length
                    ? `Принять без просмотра карточки с уверенностью от ${BULK_ACCEPT_MIN} % и всеми обязательными полями`
                    : `Среди выбранных нет карточек с уверенностью от ${BULK_ACCEPT_MIN} % и всеми обязательными полями — откройте и проверьте их`
                }
              >
                Принять уверенные ({bulkOk.length})
              </Button>
            )}
            <Button size="sm" variant="accent" icon={<Sparkles className="h-4 w-4" />} onClick={openWizard} disabled={!schema}>
              Оформить с ИИ ({selected.size})
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {itemsQ.isLoading || schemaQ.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[60px] rounded-[var(--r-md)]" />
          ))}
        </div>
      ) : itemsQ.isError ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Не удалось загрузить товары"
          description="Проверьте соединение и обновите."
          action={
            <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => itemsQ.refetch()}>
              Повторить
            </Button>
          }
        />
      ) : list.length === 0 ? (
        // «В работе» is the default filter: an empty tab under it is «всё сделано», not «ничего не найдено».
        query || vitrine !== "work" || (current === "ready" && onlyIncomplete) ? (
          <EmptyState
            icon={Search}
            title="Ничего не найдено"
            description="Измените поиск или фильтр витрины."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setVitrine("work");
                  setOnlyIncomplete(false);
                }}
              >
                Сбросить фильтры
              </Button>
            }
          />
        ) : (
          <EmptyState icon={current === "ready" ? ClipboardCheck : PartyPopper} title={EMPTY[current].title} description={EMPTY[current].description} />
        )
      ) : (
        <>
          <CardList
            items={list}
            schema={schema}
            selected={selected}
            onToggle={(id, on) =>
              setSelected((prev) => {
                const n = new Set(prev);
                if (on) n.add(id);
                else n.delete(id);
                return n;
              })
            }
            onToggleAll={(on) => setSelected(on ? new Set(list.map((i) => i.id)) : new Set())}
            activeId={openId}
            onOpen={setOpenId}
            limit={limit}
          />
          {list.length > limit && (
            <div className="mt-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit(limit + PAGE)}>
                Показать ещё ({list.length - limit})
              </Button>
            </div>
          )}
          <p className={cn("mt-3 hidden text-center text-[11.5px] text-[var(--text-faint)] lg:block")}>
            В панели проверки: <kbd className="font-mono">J</kbd> / <kbd className="font-mono">K</kbd> — следующая / предыдущая,{" "}
            <kbd className="font-mono">A</kbd> — принять, <kbd className="font-mono">Esc</kbd> — закрыть.
          </p>
        </>
      )}

      <ReviewPanel
        item={completing ? null : openItem}
        schema={schema}
        position={{ index: index + 1, total: list.length }}
        onPrev={neighbour(-1)}
        onNext={neighbour(1)}
        onClose={() => setOpenId(null)}
        onDone={afterDone}
        onReAi={(id) => setCompleting(id)}
      />

      {completing && (
        <CardCompletionModal
          productId={completing}
          open
          reason="manual"
          onClose={() => {
            setCompleting(null);
            invalidateCards(qc);
            qc.invalidateQueries({ queryKey: ["admin", "cards", "review"] });
          }}
        />
      )}

      {wizard && schema && (
        <AiWizardLayer
          open={wizard.open}
          onClose={() => setWizard((w) => (w ? { ...w, open: false } : w))}
          items={items}
          schema={schema}
          ids={ids}
          preselect={wizard.preselect}
          preselectLabel={wizard.label}
        />
      )}
      {confirmUi}
    </div>
  );
}
