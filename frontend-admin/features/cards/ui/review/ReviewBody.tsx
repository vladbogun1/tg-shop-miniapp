"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { categoryPathName, type CardSchema } from "../../model/schema";
import { MissingNotice, ReviewedLine, SourcesNotes } from "./ReviewNotes";
import { Section, ScalarRow } from "./parts";
import { SpecsSection } from "./SpecsSection";
import { TextsSection } from "./TextsSection";
import type { ReviewPanelState } from "./use-review-panel";

/** Прокручиваемая часть панели: категория и бренд, характеристики, тексты, источники. */
export function ReviewBody({ s, schema }: { s: ReviewPanelState; schema: CardSchema | undefined }) {
  const { reviewQ, data, cur, meta } = s;
  if (reviewQ.isLoading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  if (reviewQ.isError)
    return (
      <div className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3 text-[13px] font-semibold text-[var(--danger-ink)]">
        ✕ Не удалось загрузить карточку.{" "}
        <button type="button" className="underline" onClick={() => reviewQ.refetch()}>
          Повторить
        </button>
      </div>
    );
  return (
    <div className="tab-in flex flex-col gap-5">
      <MissingNotice cur={cur} schema={schema} />

      <Section title="Категория и бренд">
        <div className="flex flex-col gap-1.5">
          <ScalarRow
            label="Категория"
            change={data?.last?.changed?.category}
            current={(schema && categoryPathName(schema, cur.categorySlug)) || cur.categorySlug || null}
            fmt={(v) => (schema && categoryPathName(schema, v)) || v}
          />
          <ScalarRow label="Бренд" change={data?.last?.changed?.brand} current={cur.brand ?? null} fmt={(v) => v} />
        </div>
      </Section>

      <SpecsSection item={cur} schema={schema} data={data} draft={s.specsDraft} onDraft={s.setSpecsDraft} />

      <TextsSection data={data} currentText={s.currentText} texts={s.texts} onText={s.setText} />

      <SourcesNotes meta={meta} />
      <ReviewedLine data={data} meta={meta} />
    </div>
  );
}
