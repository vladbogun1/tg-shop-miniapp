"use client";

import type { SpecType } from "@shop/core/catalog";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { productsWord } from "../../model/words";
import { SPEC_TYPE_LABEL } from "../../model/labels";
import type { Draft } from "../../model/attribute-draft";
import type { AdminSpecAttribute, AdminSpecGroup } from "../../model/types";
import { SectionTitle } from "./parts";

interface Props {
  d: Draft;
  attribute: AdminSpecAttribute | null;
  sortedGroups: AdminSpecGroup[];
  used: number;
  keyLocked: boolean;
  typeLocked: boolean;
  keyError: string | undefined;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  setD: (f: (p: Draft) => Draft) => void;
  setLabelRu: (v: string) => void;
}

/** Названия на трёх языках, ключ, тип, группа. */
export function AttributeLabels({ d, attribute, sortedGroups, used, keyLocked, typeLocked, keyError, set, setD, setLabelRu }: Props) {
  return (
  <section className="flex flex-col gap-3">
    <SectionTitle>Название</SectionTitle>
    <div className="grid gap-3 sm:grid-cols-3">
      <Input
        label="RU"
        autoFocus={!attribute}
        value={d.labelRu}
        maxLength={96}
        onChange={(e) => setLabelRu(e.target.value)}
        placeholder="Вес"
      />
      <Input label="UK" value={d.labelUk} maxLength={96} onChange={(e) => set("labelUk", e.target.value)} placeholder="Вага" />
      <Input label="EN" value={d.labelEn} maxLength={96} onChange={(e) => set("labelEn", e.target.value)} placeholder="Weight" />
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Input
          label="Ключ"
          value={d.key}
          disabled={keyLocked}
          maxLength={48}
          className="font-mono"
          onChange={(e) =>
            setD((p) => ({ ...p, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"), keyTouched: true }))
          }
          error={keyLocked ? undefined : d.key || d.labelRu ? keyError : undefined}
          hint={keyLocked ? undefined : "Латиница, snake_case. Хранится в товарах и в адресах фильтров."}
          rightSlot={keyLocked ? <Lock className="h-3.5 w-3.5 text-[var(--text-faint)]" /> : undefined}
        />
        {keyLocked && (
          <span className="text-[12px] text-[var(--text-faint)]">
            Используется в {productsWord(used)} — ключ не меняется
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Select<SpecType>
          label="Тип"
          value={d.type}
          onChange={(v) => !typeLocked && set("type", v)}
          options={(Object.keys(SPEC_TYPE_LABEL) as SpecType[]).map((t) => ({ value: t, label: SPEC_TYPE_LABEL[t] }))}
        />
        {typeLocked && <span className="text-[12px] text-[var(--text-faint)]">Тип заполненной характеристики не меняется</span>}
      </div>
      <Select
        label="Группа"
        value={d.group}
        onChange={(v) => set("group", v)}
        options={
          sortedGroups.length
            ? sortedGroups.map((g) => ({ value: g.key, label: g.labelRu || g.key }))
            : [{ value: "main", label: "Основное" }]
        }
      />
    </div>
    {!attribute && d.type === "text" && (
      <p className="text-[12px] text-[var(--text-faint)]">
        Текст — только для моделей и названий (Omron D2FC-F-7N): не переводится и не фильтруется.
      </p>
    )}
  </section>
  );
}
