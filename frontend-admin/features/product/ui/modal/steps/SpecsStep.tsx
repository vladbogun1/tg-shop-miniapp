"use client";

import Link from "next/link";
import { Button } from "@shop/ui/admin-button";
import { Spinner } from "@/components/ui/Spinner";
import { SpecsForm } from "@/features/catalog";
import { S } from "../../../model/steps";
import { CardStatusPanel } from "../CardStatusPanel";
import { EmptyStep } from "../parts";
import type { ProductCtx } from "../ctx";

/** Форма характеристик по схеме категории — или то, что мешает её показать (нет категории, схема грузится/не пришла, пусто). */
function SpecsBody({ x }: { x: ProductCtx }) {
  const {
    f,
    set,
    product,
    schemaQ,
    attrs,
    missing,
    filledCount,
    pathText,
    resetKey,
    showMissing,
    setShowMissing,
    go,
  } = x;
  return !f.categoryId ? (
    <EmptyStep
      text="Сначала выберите категорию — форма характеристик строится по её схеме."
      action={
        <Button size="sm" variant="surface" onClick={() => go(S.category)}>
          К категории
        </Button>
      }
    />
  ) : schemaQ.isLoading ? (
    <div className="grid place-items-center py-10">
      <Spinner />
    </div>
  ) : schemaQ.isError ? (
    <EmptyStep
      text="Не удалось загрузить схему характеристик."
      action={
        <Button size="sm" variant="surface" onClick={() => schemaQ.refetch()}>
          Повторить
        </Button>
      }
    />
  ) : attrs.length === 0 ? (
    <EmptyStep
      text={`У категории «${pathText}» пока нет характеристик.`}
      action={
        <Link
          href={`/categories?edit=${f.categoryId}`}
          className="text-[13px] font-semibold text-[var(--accent-hi)] hover:underline"
        >
          Добавить в «Категориях»
        </Link>
      }
    />
  ) : (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[var(--text-muted)]">
        <span className="min-w-0 truncate">{pathText}</span>
        <span className="tabular">
          заполнено {filledCount} из {attrs.length}
          {missing.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMissing((v) => !v)}
              className="ml-2 font-semibold text-[var(--warn)] hover:underline"
            >
              обязательных нет: {missing.length}
            </button>
          )}
        </span>
      </div>
      <SpecsForm
        attrs={attrs}
        groups={schemaQ.data?.groups ?? []}
        specs={f.specs}
        onChange={(s) => set("specs", s)}
        meta={product?.cardMeta}
        resetKey={resetKey}
        highlightMissing={showMissing}
      />
    </>
  );
}

export function SpecsStep({ x }: { x: ProductCtx }) {
  const {
    product,
    missing,
    cardStatus,
    dirty,
    statusBusy,
    changeCardStatus,
    onClose,
    onCompleteWithAi,
  } = x;
  return (
    <div className="flex flex-col gap-4">
      <SpecsBody x={x} />
      <CardStatusPanel
        status={cardStatus}
        confidence={product?.cardConfidence}
        missing={missing.length}
        sources={product?.cardMeta?.sources ?? []}
        notes={product?.cardMeta?.notes}
        busy={statusBusy}
        onReady={() => changeCardStatus("READY")}
        onDraft={() => changeCardStatus("DRAFT")}
        onAi={
          onCompleteWithAi && product
            ? () => (onClose(), onCompleteWithAi(product.id))
            : undefined
        }
        dirty={dirty}
      />
    </div>
  );
}
