"use client";

import { RotateCcw, Search, User } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { errorLabel, SOURCE_ORDER, sourceLabel } from "../model/labels";
import type { ActivityFacets } from "../model/types";
import type { FeedFields, FeedShared } from "./use-feed-filters";

interface Props {
  shared: FeedShared;
  fields: FeedFields;
  setField: (key: keyof FeedFields, value: string) => void;
  facets: ActivityFacets | undefined;
  typeOptions: { value: string; label: string }[];
  /** Хоть что-то задано — показать «Сбросить». */
  filtered: boolean;
  onReset: () => void;
}

const RESULT_OPTIONS = [
  { value: "", label: "Любой" },
  { value: "OK", label: "Успешно / доставлено" },
  { value: "FAILED", label: "Ошибка / не доставлено" },
  { value: "SKIPPED", label: "Пропущено" },
];

const RECIPIENT_OPTIONS = [
  { value: "", label: "Всем" },
  { value: "CUSTOMER", label: "Покупателям" },
  { value: "ADMINS", label: "Админам" },
];

export function FeedFilters({ shared, fields, setField, facets, typeOptions, filtered, onReset }: Props) {
  const { customer, clearCustomer } = shared;
  return (
    <div className="card mb-4 grid min-w-0 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Select
        label="Источник"
        value={shared.source}
        onChange={(v) => {
          shared.setSource(v);
          shared.setType("");
        }}
        options={[{ value: "", label: "Все источники" }, ...SOURCE_ORDER.map((s) => ({ value: s, label: sourceLabel(s) }))]}
      />
      <Select
        label="Событие"
        value={shared.type}
        onChange={shared.setType}
        options={[{ value: "", label: "Все события" }, ...typeOptions]}
      />
      <Select label="Результат" value={shared.result} onChange={shared.setResult} options={RESULT_OPTIONS} />
      <Select
        label="Кому писал бот"
        value={fields.recipient}
        onChange={(v) => setField("recipient", v)}
        options={RECIPIENT_OPTIONS}
      />
      <Select
        label="Причина"
        value={fields.errorCode}
        onChange={(v) => setField("errorCode", v)}
        options={[
          { value: "", label: "Любая" },
          ...(facets?.errorCodes ?? []).map((c) => ({ value: c, label: errorLabel(c) })),
        ]}
      />
      <Input
        label="Заказ"
        placeholder="#1a2b3c4d или UUID"
        value={fields.orderRaw}
        onChange={(e) => setField("orderRaw", e.target.value)}
      />
      <Input
        label="Поиск"
        placeholder="текст, @username, имя, Telegram id"
        icon={<Search className="h-4 w-4" />}
        value={fields.qRaw}
        onChange={(e) => setField("qRaw", e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input label="С" type="date" value={fields.from} max={fields.to || undefined} onChange={(e) => setField("from", e.target.value)} />
        <Input label="По" type="date" value={fields.to} min={fields.from || undefined} onChange={(e) => setField("to", e.target.value)} />
      </div>
      {(filtered || customer) && (
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          {customer && (
            <button
              type="button"
              onClick={clearCustomer}
              className="hit chip-tint !bg-[var(--surface-3)]"
              title="Убрать фильтр по покупателю"
            >
              <User className="h-3 w-3" /> {customer.label} ✕
            </button>
          )}
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={onReset}>
            Сбросить фильтры
          </Button>
        </div>
      )}
    </div>
  );
}
