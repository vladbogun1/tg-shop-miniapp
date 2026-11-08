"use client";

/**
 * Новые товары черновика: как их назвал и описал ИИ. Правится название, категория, цена и описание; характеристики
 * и фото — как написал ИИ (поправить можно потом в «Карточках»). Товары создадутся скрытыми, с остатком 0.
 */
import { ImageOff, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCardSchema } from "@/features/cards";
import type { DraftCard, SupplyDraft } from "../../api-drafts";
import type { LeafCategory } from "../../model/ai/match-prompt";
import { specRows, type DraftProduct, type SpecAttr } from "../../model/drafts/draft";
import type { DraftEdit } from "./use-draft-edit";

const MAX_PHOTOS = 3;

/** Внешняя ссылка ИИ: после «Принять» сервер сам скачает её к товару (с вырезкой фона), даже если сайт не отдаёт её браузеру. */
function Thumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <ImageOff className="m-auto h-full w-5 text-[var(--text-faint)]" aria-label="превью недоступно" />;
  return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-contain" />;
}

function Photos({ photos }: { photos: string[] }) {
  if (photos.length === 0) return <p className="text-[12.5px] text-[var(--text-faint)]">ИИ не нашёл фото — добавите в «Карточках».</p>;
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {photos.slice(0, MAX_PHOTOS).map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-20 w-20 shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[#1a1a1a]">
          <Thumb url={url} />
        </a>
      ))}
    </div>
  );
}

function Card({ card, id, edit, attrs }: { card: DraftCard; id: string; edit: DraftEdit; attrs: Map<string, SpecAttr> }) {
  const specs = specRows(card.specs ?? {}, attrs);
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Textarea
        label="Описание (рус.)"
        rows={5}
        value={edit.descriptions[id] ?? card.description?.ru ?? ""}
        hint="Переводы на украинский и английский ИИ уже написал — после правки обновите их в «Переводах»"
        onChange={(e) => edit.setDescription(id, e.target.value)}
      />
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <div className="field-label mb-1">Характеристики</div>
          {specs.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-faint)]">ИИ не заполнил</p>
          ) : (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
              {specs.map((s) => (
                <div key={s.key} className="contents">
                  <dt className="text-[var(--text-muted)]">{s.label}</dt>
                  <dd className="min-w-0 break-words text-[var(--text)]">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div>
          <div className="field-label mb-1">Фото</div>
          <Photos photos={card.photos ?? []} />
        </div>
        {card.notes && <p className="break-words text-[12.5px] text-[var(--text-muted)]">ИИ: {card.notes}</p>}
      </div>
    </div>
  );
}

function NoCard({ id, draft }: { id: string; draft: SupplyDraft }) {
  const job = draft.jobs.find((j) => j.kind === "CARD" && j.key === id);
  const running = job && (job.status === "RUNNING" || job.status === "QUEUED");
  return (
    <p className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
      {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />}
      {running ? "ИИ пишет карточку…" : "Карточки нет: товар создастся с названием и ценой, остальное — в «Карточках» (или «Доделать с ИИ»)."}
    </p>
  );
}

function ProductBlock({ p, draft, edit, categories, attrs }: { p: DraftProduct; draft: SupplyDraft; edit: DraftEdit; categories: LeafCategory[]; attrs: Map<string, SpecAttr> }) {
  const card = draft.cards[p.id];
  const facts = [p.brand && `бренд ${p.brand}`, p.variants.length > 0 && `варианты: ${p.variants.join(", ")}`, `строки ${p.lineIds.join(", ")}`].filter(Boolean).join(" · ");
  return (
    <div className="card flex min-w-0 flex-col gap-3 p-3.5">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_130px] sm:items-start">
        <Input label="Название" value={p.title} onChange={(e) => edit.editProduct(p, { title: e.target.value })} />
        <Select label="Категория" value={p.categoryId ?? ""} options={categories.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => edit.editProduct(p, { categoryId: v })} />
        <Input label="Цена, ₴" inputMode="decimal" value={edit.prices[p.id] ?? ""} hint="закупка × курс × 2" onChange={(e) => edit.setPrice(p.id, e.target.value)} />
      </div>
      <div className="text-[12.5px] text-[var(--text-muted)]">{facts}</div>
      {card ? <Card card={card} id={p.id} edit={edit} attrs={attrs} /> : <NoCard id={p.id} draft={draft} />}
    </div>
  );
}

export function DraftProducts({ draft, edit, categories }: { draft: SupplyDraft; edit: DraftEdit; categories: LeafCategory[] }) {
  const schema = useCardSchema().data;
  const attrs = useMemo(() => new Map((schema?.attributes ?? []).map((a) => [a.key, a])), [schema]);
  if (edit.products.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {edit.products.map((p) => (
        <ProductBlock key={p.id} p={p} draft={draft} edit={edit} categories={categories} attrs={attrs} />
      ))}
    </div>
  );
}
