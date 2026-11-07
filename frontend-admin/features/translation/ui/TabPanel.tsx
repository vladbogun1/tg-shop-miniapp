"use client";

/** «Переводы»: фильтры, подсказка вкладки с кнопками действий и пустые состояния списка. */
import { Button } from "@shop/ui/admin-button";
import { CheckCheck, CheckSquare, ListChecks, RefreshCw, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { TYPE_OPTIONS, type Bucket, type LangScope, type TypeFilter } from "../model/queue";

const TAB_HINT: Record<Bucket, string> = {
  missing: "Нет перевода хотя бы на одном языке — покупатель видит русский текст.",
  stale: "Русский оригинал изменили после перевода. Старый перевод скрыт, пока его не обновят или не подтвердят.",
  review: "Переведено ИИ, но никто не проверял. Покупатель уже видит эти тексты.",
  done: "Проверено человеком или написано вручную.",
};

const EMPTY: Record<Bucket, { title: string; text: string }> = {
  missing: { title: "Всё переведено", text: "У всех текстов есть перевод. Новый товар или категория появятся здесь." },
  stale: { title: "Устаревших нет", text: "Когда поправите русский текст товара, его перевод окажется здесь." },
  review: { title: "Проверять нечего", text: "Все переводы ИИ просмотрены." },
  done: { title: "Пока пусто", text: "Принятые и написанные вручную переводы появятся здесь." },
};

export function FilterBar({
  scope,
  onScope,
  type,
  onType,
  q,
  onQ,
  extra,
}: {
  scope: LangScope;
  onScope: (v: LangScope) => void;
  type: TypeFilter;
  onType: (v: TypeFilter) => void;
  q: string;
  onQ: (v: string) => void;
  /** Справа от фильтров (кнопка «Выбрать»). */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = (scope !== "all" ? 1 : 0) + (type ? 1 : 0);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[180px] flex-1 md:order-last md:max-w-sm">
        <Input
          icon={<Search className="h-4 w-4" />}
          placeholder="Поиск по тексту, переводу, товару"
          value={q}
          onChange={(e) => onQ(e.target.value)}
          aria-label="Поиск"
        />
      </div>
      <Button
        variant={active ? "accent" : "outline"}
        className="md:hidden"
        icon={<SlidersHorizontal className="h-4 w-4" />}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Фильтры{active ? ` (${active})` : ""}
      </Button>
      <div className={cn("w-full flex-wrap items-center gap-2 md:flex md:w-auto", open ? "flex" : "hidden")}>
        <SegmentedControl<LangScope>
          className="h-10 pointer-coarse:h-11"
          value={scope}
          onChange={onScope}
          options={[
            { value: "all", label: "UK + EN" },
            { value: "uk", label: "UK" },
            { value: "en", label: "EN" },
          ]}
        />
        <Select<TypeFilter> className="w-[200px] max-sm:flex-1" value={type} onChange={onType} options={TYPE_OPTIONS} />
      </div>
      {extra}
    </div>
  );
}

export function TabHint({
  active,
  count,
  bulkBusy,
  builtinAi,
  onAi,
  onReview,
  onAcceptAll,
}: {
  active: Bucket;
  count: number;
  bulkBusy: boolean;
  /** «Перевести с ИИ (N)» встроенным ИИ; нет — ИИ выключен, остаётся ручной путь. */
  builtinAi?: ReactNode;
  onAi: () => void;
  onReview: () => void;
  onAcceptAll: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2">
      <p title={TAB_HINT[active]} className="min-w-[220px] flex-1 text-[12.5px] leading-snug text-[var(--text-muted)] lg:truncate">
        {TAB_HINT[active]}
      </p>
      {count > 0 && (
        <div className="flex flex-wrap gap-2">
          {active === "missing" && (
            <>
              {builtinAi}
              <Button variant={builtinAi ? "outline" : "accent"} icon={<Sparkles className="h-4 w-4" />} onClick={onAi}>
                {builtinAi ? "Через ChatGPT вручную" : "Перевести через ИИ"} · {count}
              </Button>
              <Button variant="outline" icon={<ListChecks className="h-4 w-4" />} onClick={onReview}>
                Вручную по одному
              </Button>
            </>
          )}
          {active === "stale" && (
            <>
              <Button variant="accent" icon={<ListChecks className="h-4 w-4" />} onClick={onReview}>
                Сверить по одному
              </Button>
              {builtinAi}
              <Button variant="outline" icon={<Sparkles className="h-4 w-4" />} onClick={onAi}>
                {builtinAi ? "Заново через ChatGPT вручную" : "Перевести заново через ИИ"} · {count}
              </Button>
            </>
          )}
          {active === "review" && (
            <>
              <Button variant="accent" icon={<ListChecks className="h-4 w-4" />} onClick={onReview}>
                Проверять по одному
              </Button>
              <Button variant="outline" icon={<CheckCheck className="h-4 w-4" />} loading={bulkBusy} onClick={onAcceptAll}>
                Принять все · {count}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** «Выбрать» (режим галочек у строк) и «Все N» — отметить весь список вкладки. */
export function SelectControls({ on, total, onToggle, onAll }: { on: boolean; total: number; onToggle: () => void; onAll: () => void }) {
  return (
    <>
      <Button variant={on ? "accent" : "outline"} icon={<CheckSquare className="h-4 w-4" />} aria-pressed={on} onClick={onToggle}>
        Выбрать
      </Button>
      {on && (
        <Button variant="ghost" onClick={onAll}>
          Все {total}
        </Button>
      )}
    </>
  );
}

export function EmptyList({ active, filtered, onReset }: { active: Bucket; filtered: boolean; onReset: () => void }) {
  if (!filtered) return <EmptyState icon={CheckCheck} title={EMPTY[active].title} description={EMPTY[active].text} />;
  return (
    <EmptyState
      icon={Search}
      title="Ничего не найдено"
      description="По этому фильтру на вкладке пусто. Сбросьте поиск или тип текста."
      action={
        <Button variant="outline" onClick={onReset}>
          Сбросить фильтр
        </Button>
      }
    />
  );
}

export function ScreenHeader({ showRefresh, fetching, onRefresh }: { showRefresh: boolean; fetching: boolean; onRefresh: () => void }) {
  return (
    <PageHeader
      title="Переводы"
      subtitle="Русский — оригинал. Украинский и английский показываются покупателю, пока русский текст не меняли."
      actions={
        showRefresh && (
          <Button
            variant="outline"
            icon={<RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            onClick={onRefresh}
          >
            Обновить
          </Button>
        )
      }
    />
  );
}
