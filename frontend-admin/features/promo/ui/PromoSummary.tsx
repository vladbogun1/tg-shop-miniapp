"use client";

import type { ReactNode } from "react";
import { summaryOf } from "../model/promo";
import type { PromoCode } from "../model/types";

function Chip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="card-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] text-[var(--text-muted)]">
      {label}
      <b className="tabular text-[var(--ink)]">{value}</b>
    </span>
  );
}

/**
 * Плашка над списком вкладки: «Действуют / Включены, но не действуют / Резерв / Истекают» (7 сут.). На вкладке «За отзывы» вместо
 * неё — «выдано N, использовано M» (как был абзац).
 */
export function PromoSummary({ list, review, now }: { list: PromoCode[]; review: { issued: number; used: number } | null; now: number }) {
  if (list.length === 0) return null;
  if (review) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip label="Выдано" value={review.issued} />
        <Chip label="Использовано" value={review.used} />
        <span className="text-[12px] text-[var(--text-faint)]">Выдаются автоматически за отзыв о заказе — личные, на один раз.</span>
      </div>
    );
  }
  const s = summaryOf(list, now);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Chip label="Действуют" value={s.live} />
      {s.stopped > 0 && <Chip label="Включены, но не действуют" value={s.stopped} />}
      <Chip label="Резерв" value={s.reserved} />
      <Chip label="Истекают за 7 дней" value={s.expiring} />
    </div>
  );
}
