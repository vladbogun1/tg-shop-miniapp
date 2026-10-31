"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import type { CardStatus } from "@shop/core/catalog";
import {
  CARD_STATUS_LABEL,
  CardStatusBadge,
  CONDITION_LABEL,
} from "@/features/catalog";
import { Image } from "@/lib/image";
import { S } from "../../model/steps";
import type { ProductForm } from "../../model/form";

export function Review({
  f,
  priceLabel,
  compareAtLabel,
  slug,
  stock,
  hasVariants,
  categoryPath,
  specsSummary,
  missing,
  cardStatus,
  confidence,
  onEdit,
}: {
  f: ProductForm;
  priceLabel: string;
  compareAtLabel: string | null;
  slug: string;
  stock: number;
  hasVariants: boolean;
  categoryPath: string;
  specsSummary: { label: string; text: string }[];
  missing: number;
  cardStatus: CardStatus;
  confidence?: number | null;
  onEdit: (step: number) => void;
}) {
  const variantsCount = f.variants.filter((v) => v.name.trim()).length;
  return (
    <div className="flex flex-col gap-3">
      <ReviewHead
        f={f}
        priceLabel={priceLabel}
        compareAtLabel={compareAtLabel}
        cardStatus={cardStatus}
        confidence={confidence}
      />

      <ReviewRow label="Описание" step={S.basics} onEdit={onEdit}>
        {f.description ? (
          <span className="line-clamp-2">{f.description}</span>
        ) : (
          <span className="text-[var(--text-faint)]">—</span>
        )}
      </ReviewRow>
      <ReviewRow label="Склад" step={S.pricing} onEdit={onEdit}>
        {stock} шт{hasVariants ? ` · ${variantsCount} вар.` : ""}
      </ReviewRow>
      <ReviewRow label="Категория и бренд" step={S.category} onEdit={onEdit}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {categoryPath ? (
            <span>{categoryPath}</span>
          ) : (
            <span className="text-[var(--warn)]">без категории</span>
          )}
          <span className="text-[var(--text-faint)]">·</span>
          {f.brand.name ? (
            <span>
              {f.brand.name}
              {!f.brand.id && (
                <span className="text-[var(--text-faint)]"> (новый)</span>
              )}
            </span>
          ) : (
            <span className="text-[var(--text-faint)]">без бренда</span>
          )}
          <span className="text-[var(--text-faint)]">·</span>
          <span>
            {CONDITION_LABEL[f.condition]}
            {f.condition !== "NEW" && f.conditionNote.trim() && (
              <span className="text-[var(--text-muted)]">
                {" "}
                — {f.conditionNote.trim()}
              </span>
            )}
          </span>
        </span>
      </ReviewRow>
      <ReviewRow
        label={`Характеристики · ${specsSummary.length}`}
        step={S.specs}
        onEdit={onEdit}
      >
        <SpecsSummary specsSummary={specsSummary} />
        {missing > 0 && (
          <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[var(--warn)]">
            <AlertTriangle className="h-3.5 w-3.5" /> Не заполнено обязательных:{" "}
            {missing}
          </span>
        )}
      </ReviewRow>
      <ReviewRow label="Сайт" step={S.site} onEdit={onEdit}>
        <span className="break-all font-mono text-[13px]">
          /product/{slug || "…"}
        </span>
        {f.sku.trim() && (
          <span className="ml-2 text-[12.5px] text-[var(--text-muted)]">
            · арт. {f.sku.trim()}
          </span>
        )}
      </ReviewRow>
      <p className="text-[11.5px] text-[var(--text-faint)]">
        Статус карточки: {CARD_STATUS_LABEL[cardStatus]} — меняется на шаге
        «Характеристики».
      </p>
    </div>
  );
}

type HeadProps = Pick<
  Parameters<typeof Review>[0],
  "f" | "priceLabel" | "compareAtLabel" | "cardStatus" | "confidence"
>;

function ReviewHead({
  f,
  priceLabel,
  compareAtLabel,
  cardStatus,
  confidence,
}: HeadProps) {
  return (
    <div className="flex gap-3">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]">
        {f.imageKeys[0] ? (
          <Image
            src={f.imageKeys[0]}
            alt=""
            size={200}
            className="aspect-square w-full"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[12px] text-[var(--text-faint)]">
            нет фото
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold leading-snug text-[var(--ink)]">
          {f.title || "Без названия"}
        </p>
        <p className="font-display tabular mt-1 text-[16px] font-bold text-[var(--accent-hi)]">
          {priceLabel}
          {compareAtLabel && (
            <span className="ml-2 text-[13px] font-semibold text-[var(--text-faint)] line-through">
              {compareAtLabel}
            </span>
          )}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="field-label !text-[11px] !text-[var(--text-faint)]">
            {f.imageKeys.length} фото · {f.active ? "на витрине" : "скрыт"}
          </span>
          <CardStatusBadge
            status={cardStatus}
            confidence={confidence}
            compact
          />
        </div>
      </div>
    </div>
  );
}

function SpecsSummary({
  specsSummary,
}: {
  specsSummary: { label: string; text: string }[];
}) {
  return (
    <>
      {specsSummary.length ? (
        <span className="grid gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-2">
          {specsSummary.slice(0, 10).map((s) => (
            <span key={s.label} className="flex min-w-0 gap-1.5">
              <span className="shrink-0 text-[var(--text-faint)]">
                {s.label}:
              </span>
              <span className="truncate">{s.text}</span>
            </span>
          ))}
          {specsSummary.length > 10 && (
            <span className="text-[var(--text-faint)]">
              …и ещё {specsSummary.length - 10}
            </span>
          )}
        </span>
      ) : (
        <span className="text-[var(--text-faint)]">не заполнены</span>
      )}
    </>
  );
}

function ReviewRow({
  label,
  step,
  onEdit,
  children,
}: {
  label: string;
  step: number;
  onEdit: (step: number) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-[var(--line)] pt-2.5">
      <div className="min-w-0 flex-1">
        <div className="field-label !text-[11px] !text-[var(--text-faint)]">
          {label}
        </div>
        <div className="mt-0.5 flex flex-col text-[14px] text-[var(--text)]">
          {children}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onEdit(step)}
        className="hit focusable font-display shrink-0 rounded-[var(--r-sm)] text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
      >
        Изменить
      </button>
    </div>
  );
}
