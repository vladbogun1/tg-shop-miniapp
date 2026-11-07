"use client";

/**
 * Под группами ревью карточки — всё, что ручной путь применял сверх полей: фото из ответа (отметить, порядок),
 * переводы uk/en (посмотреть, поправить, сохранять ли), «Сразу в «Готово»» (по умолчанию — как решит уверенность ИИ),
 * «выложить», новые опции для схемы, что из ответа не применится и почему, источники и заметки ИИ.
 * После применения — ход загрузки фото.
 */
import type { Proposal, TextField, TextLang } from "../../model";
import { AUTO_READY_OVERALL, RED_FIELD, type ProductSel } from "../../model/selection";
import type { RemovedSpec } from "../../model/spec-replace";
import type { CardItem } from "../../model/item";
import type { ProductReview } from "../../model/types";
import { PhotoPicks } from "../PhotoPicks";
import { ProposalsBox, SourcesBox } from "../ReviewCardParts";
import { CardIssues } from "../shared";
import { TextsBlock } from "../TextsBlock";
import { PhotoSummary } from "../photos/PhotoSummary";
import type { PhotoImport } from "../photos/use-photo-import";
import type { TranslatedLocale } from "@shop/core/i18n";

const TRANSLATED: readonly TextLang[] = ["uk", "en"];

export interface ExtrasProps {
  item: CardItem;
  review: ProductReview;
  /** Что уйдёт в запись при текущем выборе (для «сохранится / не сохранится» у переводов). */
  sel: ProductSel | null;
  finished: boolean;
  photos: string[];
  setPhotos: (next: string[]) => void;
  photoImport: PhotoImport;
  translations: boolean;
  setTranslations: (v: boolean) => void;
  onEditTranslation: (field: TextField, lang: TranslatedLocale, value: string) => void;
  publish: boolean;
  setPublish: (v: boolean) => void;
  /** Ручной выбор статуса; null — автоматически. */
  markReady: boolean | null;
  setMarkReady: (v: boolean) => void;
  sure: boolean;
  /** Сколько характеристик ИИ подтвердил без изменений (уверенность обновится). */
  confirmed: number;
  onAddOption: (p: Proposal) => void;
  /** «Заменить характеристики целиком» и что тогда удалится (заполненное в карточке, чего нет в ответе). */
  replace: boolean;
  setReplace: (v: boolean) => void;
  removed: RemovedSpec[];
}

export function CardReviewExtras(p: ExtrasProps) {
  if (p.finished) return <PhotoSummary photos={p.photoImport} />;
  return (
    <div className="flex flex-col gap-3">
      <PhotoBlock review={p.review} photos={p.photos} setPhotos={p.setPhotos} />
      <Translations {...p} />
      <ApplyOptions {...p} />
      <ProposalsBox proposals={p.review.proposals} onAddOption={p.onAddOption} />
      <NotApplied review={p.review} confirmed={p.confirmed} />
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

/** uk/en названия, описания и заметки о состоянии — как в прежней проверке: видно, что сохранится, можно поправить. */
function Translations(p: ExtrasProps) {
  const has = Object.values(p.review.texts).some((t) => !!t && (!!t.uk.trim() || !!t.en.trim()));
  if (!has || !p.sel) return null;
  const sel = { ...p.sel, translations: p.translations };
  return (
    <div className="-mt-3" data-testid="ai-review-translations">
      <TextsBlock
        review={p.review}
        sel={sel}
        langs={TRANSLATED}
        onSel={(patch) => patch.translations !== undefined && p.setTranslations(patch.translations)}
        onEditText={(field, lang, value) => lang !== "ru" && p.onEditTranslation(field, lang, value)}
      />
    </div>
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
      {p.item.active !== true && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.publish} onChange={(e) => p.setPublish(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
          Выложить на витрину, если карточка готова
        </label>
      )}
      <ReplaceSpecs {...p} />
    </div>
  );
}

/** Переключатель замены — только когда есть что удалить; список удаляемого виден до записи. */
function ReplaceSpecs({ replace, setReplace, removed }: ExtrasProps) {
  if (removed.length === 0) return null;
  const names = removed.map((r) => r.label).join(", ");
  return (
    <label className="flex items-start gap-2" data-testid="replace-specs">
      <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" data-testid="replace-specs-toggle" />
      <span className="min-w-0">
        Заменить характеристики целиком
        <span className={`block text-[12px] ${replace ? "text-[var(--danger-ink)]" : "text-[var(--text-faint)]"}`} data-testid="replace-specs-removed">
          {replace ? "Будут удалены" : "Выключено. Если включить, удалятся"} характеристики, которых нет в ответе: {names}
        </span>
      </span>
    </label>
  );
}

/**
 * Что из ответа не попадёт в карточку и почему (нет такой характеристики, опции, не число…) и замечания к ответу в
 * целом; плюс подтверждённое без изменений — его уверенность обновится.
 */
function NotApplied({ review, confirmed }: { review: ProductReview; confirmed: number }) {
  const dropped = review.fields.filter((f) => f.value === undefined);
  const issues = review.issues.filter((i) => i.level !== "info");
  if (!dropped.length && !issues.length && !confirmed) return null;
  return (
    <section className="flex flex-col gap-1.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px]" data-testid="ai-review-skipped">
      {dropped.length > 0 && <div className="field-label !text-[11px]">Не применится</div>}
      {dropped.map((f) => (
        <div key={f.key} className="min-w-0">
          <span className="font-semibold text-[var(--text)]">{f.label}</span>
          <span className="break-all font-mono text-[12px] text-[var(--text-muted)]"> {JSON.stringify(f.raw)}</span>
          <CardIssues issues={f.issues} />
        </div>
      ))}
      <CardIssues issues={issues} />
      {confirmed > 0 && <p className="text-[12.5px] text-[var(--text-muted)]">Без изменений: {confirmed} — ИИ подтвердил прежние значения, их уверенность обновится</p>}
    </section>
  );
}
