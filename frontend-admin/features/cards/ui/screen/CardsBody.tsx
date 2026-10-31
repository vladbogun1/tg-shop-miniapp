"use client";

import { ClipboardCheck, PartyPopper, RefreshCw, Search } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CardTab } from "../../model/view";
import { CardList } from "../CardList";
import type { CardsScreenState } from "./use-cards-screen";

const EMPTY: Record<CardTab, { title: string; description: string }> = {
  draft: { title: "Всё оформлено", description: "Черновиков нет: у каждого товара есть карточка от ИИ или проверенная." },
  review: { title: "Нечего проверять", description: "Карточки от ИИ появятся здесь после «Оформить с ИИ»." },
  ready: { title: "Пока нет проверенных", description: "Принятые карточки будут здесь." },
};

function EmptyList({ s }: { s: CardsScreenState }) {
  // «В работе» is the default filter: an empty tab under it is «всё сделано», not «ничего не найдено».
  const filtered = s.query || s.vitrine !== "work" || (s.current === "ready" && s.onlyIncomplete);
  if (!filtered) {
    return <EmptyState icon={s.current === "ready" ? ClipboardCheck : PartyPopper} title={EMPTY[s.current].title} description={EMPTY[s.current].description} />;
  }
  return (
    <EmptyState
      icon={Search}
      title="Ничего не найдено"
      description="Измените поиск или фильтр витрины."
      action={
        <Button variant="outline" onClick={s.resetFilters}>
          Сбросить фильтры
        </Button>
      }
    />
  );
}

function Rows({ s }: { s: CardsScreenState }) {
  const { list, limit } = s;
  return (
    <>
      <CardList
        items={list}
        schema={s.schema}
        selected={s.selected}
        onToggle={s.toggleRow}
        onToggleAll={s.toggleAll}
        activeId={s.openId}
        onOpen={s.setOpenId}
        limit={limit}
      />
      {list.length > limit && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={s.showMore}>
            Показать ещё ({list.length - limit})
          </Button>
        </div>
      )}
      <p className="mt-3 hidden text-center text-[11.5px] text-[var(--text-faint)] lg:block">
        В панели проверки: <kbd className="font-mono">J</kbd> / <kbd className="font-mono">K</kbd> — следующая / предыдущая,{" "}
        <kbd className="font-mono">A</kbd> — принять, <kbd className="font-mono">Esc</kbd> — закрыть.
      </p>
    </>
  );
}

/** Загрузка, ошибка, пусто или список с «Показать ещё». */
export function CardsBody({ s }: { s: CardsScreenState }) {
  if (s.itemsQ.isLoading || s.schemaQ.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[60px] rounded-[var(--r-md)]" />
        ))}
      </div>
    );
  }
  if (s.itemsQ.isError) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Не удалось загрузить товары"
        description="Проверьте соединение и обновите."
        action={
          <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => s.itemsQ.refetch()}>
            Повторить
          </Button>
        }
      />
    );
  }
  return s.list.length === 0 ? <EmptyList s={s} /> : <Rows s={s} />;
}
