"use client";

/**
 * Карточки товаров («/cards») — docs/CATALOG-SPECS.md §4–5. Характеристики, бренд, категорию и тексты
 * заполняет внешний ИИ с поиском в интернете, админ проверяет. Три вкладки по статусу карточки,
 * фильтр витрины, поиск; «Оформить с ИИ» — пакетный мастер; клик по строке — панель проверки;
 * «Принять уверенные» — массовое принятие. Черновик не выкладывается без явного «Выложить без оформления».
 */
import { RefreshCw, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { useMediaQuery } from "@shop/ui/use-media";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@shop/ui/admin-button";
import { TAB_LABEL } from "../../model/view";
import { CardCompletionModal } from "../completion/CardCompletionModal";
import { ReviewPanel } from "../review/ReviewPanel";
import { AiWizardLayer } from "../wizard/AiWizardLayer";
import { CardsBody } from "./CardsBody";
import { CardsBulkBar } from "./CardsBulkBar";
import { CardsToolbar } from "./CardsToolbar";
import { useCardsScreen, type CardsScreenState } from "./use-cards-screen";

function HeaderActions({ s }: { s: CardsScreenState }) {
  const fetching = s.itemsQ.isFetching || s.schemaQ.isFetching;
  // Пока что-то отмечено, «Оформить с ИИ (N)» живёт в панели выбора — вторую такую же кнопку не держим.
  const showWizard = s.selected.size === 0;
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label="Обновить"
        title="Обновить"
        icon={<RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
        onClick={() => {
          s.itemsQ.refetch();
          s.schemaQ.refetch();
        }}
      />
      {showWizard && (
        <Button
          variant="accent"
          chamfer
          icon={<Sparkles className="h-4 w-4" />}
          disabled={!s.wizardIds.length || !s.schema}
          onClick={s.openWizard}
          title={`Оформить все товары вкладки «${TAB_LABEL[s.current]}»`}
        >
          Оформить с ИИ ({s.wizardIds.length})
        </Button>
      )}
    </>
  );
}

/** Панель проверки: рядом со списком на ≥ 1280 px (master-detail), поверх него — на планшете и телефоне. */
function Panel({ s, docked }: { s: CardsScreenState; docked: boolean }) {
  return (
    <ReviewPanel
      docked={docked}
      item={s.completing ? null : s.openItem}
      schema={s.schema}
      position={{ index: s.index + 1, total: s.list.length }}
      onPrev={s.neighbour(-1)}
      onNext={s.neighbour(1)}
      onClose={() => s.setOpenId(null)}
      onDone={s.afterDone}
      onReAi={(id) => s.setCompleting(id)}
    />
  );
}

function Layers({ s }: { s: CardsScreenState }) {
  const { schema, wizard } = s;
  return (
    <>
      {s.completing && <CardCompletionModal productId={s.completing} open reason="manual" onClose={s.closeCompletion} />}
      {wizard && schema && (
        <AiWizardLayer
          open={wizard.open}
          onClose={() => s.setWizard((w) => (w ? { ...w, open: false } : w))}
          items={s.items}
          schema={schema}
          ids={s.ids}
          preselect={wizard.preselect}
          preselectLabel={wizard.label}
        />
      )}
    </>
  );
}

export function CardsScreen() {
  // useSearchParams («?ids=» from a supply) needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <CardsScreenBody />
    </Suspense>
  );
}

function CardsScreenBody() {
  const s = useCardsScreen();
  const docked = useMediaQuery("(min-width: 1280px)", false);
  const split = docked && !!s.openItem && !s.completing;
  return (
    <div>
      <PageHeader
        title="Карточки"
        subtitle="ИИ заполняет, вы проверяете. Черновик не уходит на витрину без «Выложить без оформления»."
        actions={<HeaderActions s={s} />}
      />
      <div className={cn(split && "grid grid-cols-[minmax(420px,1fr)_minmax(560px,720px)] items-start gap-4")}>
        <div className="min-w-0">
          {/* Одна липкая полоса под шапкой: вкладки, поиск, фильтры и панель выбора. */}
          <div className={cn("sticky top-[var(--hdr-h,61px)] z-20 mb-3 bg-[var(--bg)] pb-2 pt-1", !split && "-mx-4 px-4 lg:-mx-7 lg:px-7")}>
            <CardsToolbar s={s} />
            <CardsBulkBar s={s} />
          </div>
          <CardsBody s={s} compact={split} />
        </div>
        {docked && <Panel s={s} docked />}
      </div>
      {!docked && <Panel s={s} docked={false} />}
      <Layers s={s} />
    </div>
  );
}
