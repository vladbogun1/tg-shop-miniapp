"use client";

/** «Переводы»: фильтры, подсказка вкладки с кнопками действий и пустые состояния списка. */
import { Button } from "@shop/ui/admin-button";
import { CheckCheck, ListChecks, RefreshCw, Search, Sparkles } from "lucide-react";
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
}: {
  scope: LangScope;
  onScope: (v: LangScope) => void;
  type: TypeFilter;
  onType: (v: TypeFilter) => void;
  q: string;
  onQ: (v: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
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
      <div className="min-w-[220px] flex-1">
        <Input
          icon={<Search className="h-4 w-4" />}
          placeholder="Поиск по тексту, переводу, товару"
          value={q}
          onChange={(e) => onQ(e.target.value)}
          aria-label="Поиск"
        />
      </div>
    </div>
  );
}

export function TabHint({
  active,
  count,
  bulkBusy,
  onAi,
  onReview,
  onAcceptAll,
}: {
  active: Bucket;
  count: number;
  bulkBusy: boolean;
  onAi: () => void;
  onReview: () => void;
  onAcceptAll: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-3">
      <p className="min-w-[220px] flex-1 text-[13px] leading-snug text-[var(--text-muted)]">{TAB_HINT[active]}</p>
      {count > 0 && (
        <div className="flex flex-wrap gap-2">
          {active === "missing" && (
            <>
              <Button variant="accent" icon={<Sparkles className="h-4 w-4" />} onClick={onAi}>
                Перевести через ИИ · {count}
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
              <Button variant="outline" icon={<Sparkles className="h-4 w-4" />} onClick={onAi}>
                Перевести заново через ИИ · {count}
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
