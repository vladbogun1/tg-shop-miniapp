"use client";

/**
 * Карточки товаров («/cards») — docs/CATALOG-SPECS.md §4–5. Характеристики, бренд, категорию и тексты
 * заполняет внешний ИИ с поиском в интернете, админ проверяет. Три вкладки по статусу карточки,
 * фильтр витрины, поиск; «Оформить с ИИ» — пакетный мастер; клик по строке — панель проверки;
 * «Принять уверенные» — массовое принятие. Черновик не выкладывается без явного «Выложить без оформления».
 */
import { RefreshCw, Sparkles } from "lucide-react";
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
      <Button
        variant="accent"
        chamfer
        icon={<Sparkles className="h-4 w-4" />}
        disabled={!s.wizardIds.length || !s.schema}
        onClick={s.openWizard}
        title={s.selected.size ? "Оформить отмеченные товары" : `Оформить все товары вкладки «${TAB_LABEL[s.current]}»`}
      >
        Оформить с ИИ ({s.wizardIds.length})
      </Button>
    </>
  );
}

function Layers({ s }: { s: CardsScreenState }) {
  const { schema, wizard } = s;
  return (
    <>
      <ReviewPanel
        item={s.completing ? null : s.openItem}
        schema={schema}
        position={{ index: s.index + 1, total: s.list.length }}
        onPrev={s.neighbour(-1)}
        onNext={s.neighbour(1)}
        onClose={() => s.setOpenId(null)}
        onDone={s.afterDone}
        onReAi={(id) => s.setCompleting(id)}
      />
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
  const s = useCardsScreen();
  return (
    <div>
      <PageHeader
        title="Карточки"
        subtitle="Характеристики, бренд, категория и тексты товаров — их заполняет ИИ с поиском в интернете, вы проверяете. Черновик не выкладывается на витрину без явного «Выложить без оформления»."
        actions={<HeaderActions s={s} />}
      />
      <CardsToolbar s={s} />
      <CardsBulkBar s={s} />
      <CardsBody s={s} />
      <Layers s={s} />
    </div>
  );
}
