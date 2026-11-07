"use client";

/**
 * Под группами ревью карточки — всё, что ручной путь применял сверх полей: фото из ответа (отметить, порядок),
 * «Сразу в «Готово»» (по умолчанию — как решит уверенность ИИ), переводы, «выложить», новые опции для схемы,
 * источники и заметки ИИ. После применения — ход загрузки фото.
 */
import type { Proposal } from "../../model";
import { AUTO_READY_OVERALL, RED_FIELD } from "../../model/selection";
import type { CardItem } from "../../model/item";
import type { ProductReview } from "../../model/types";
import { PhotoPicks } from "../PhotoPicks";
import { ProposalsBox, SourcesBox } from "../ReviewCardParts";
import { PhotoSummary } from "../wizard/PhotoSummary";
import type { PhotoImport } from "../wizard/use-photo-import";

export interface ExtrasProps {
  item: CardItem;
  review: ProductReview;
  finished: boolean;
  photos: string[];
  setPhotos: (next: string[]) => void;
  photoImport: PhotoImport;
  translations: boolean;
  setTranslations: (v: boolean) => void;
  publish: boolean;
  setPublish: (v: boolean) => void;
  /** Ручной выбор статуса; null — автоматически. */
  markReady: boolean | null;
  setMarkReady: (v: boolean) => void;
  sure: boolean;
  onAddOption: (p: Proposal) => void;
}

export function CardReviewExtras(p: ExtrasProps) {
  if (p.finished) return <PhotoSummary photos={p.photoImport} />;
  return (
    <div className="flex flex-col gap-3">
      <PhotoBlock review={p.review} photos={p.photos} setPhotos={p.setPhotos} />
      <ApplyOptions {...p} />
      <ProposalsBox proposals={p.review.proposals} onAddOption={p.onAddOption} />
      <SourcesBox r={p.review} />
    </div>
  );
}

function PhotoBlock({ review, photos, setPhotos }: { review: ProductReview; photos: string[]; setPhotos: (next: string[]) => void }) {
  if (review.photos.length === 0) return null;
  return (
    <section className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 pb-3" data-testid="ai-review-photos">
      <PhotoPicks r={review} sel={{ photos }} onSel={(patch) => setPhotos(patch.photos)} />
    </section>
  );
}

function ApplyOptions(p: ExtrasProps) {
  const ready = p.markReady ?? p.sure;
  const hint = `Автоматически: «Готово», если ИИ уверен на ${AUTO_READY_OVERALL} % и больше и среди применяемых полей нет догадок (ниже ${RED_FIELD} %)`;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px]">
      <label className="flex items-center gap-2" title={hint}>
        <input type="checkbox" checked={ready} onChange={(e) => p.setMarkReady(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
        <span className="min-w-0">
          Сразу в «Готово»
          {p.markReady === null && <span className="text-[var(--text-faint)]"> · {p.sure ? "ИИ уверен" : "ИИ не уверен — уйдёт в «Проверить»"}</span>}
        </span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={p.translations} onChange={(e) => p.setTranslations(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
        Сохранить переводы на украинский и английский
      </label>
      {p.item.active !== true && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.publish} onChange={(e) => p.setPublish(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
          Выложить на витрину, если карточка готова
        </label>
      )}
    </div>
  );
}
