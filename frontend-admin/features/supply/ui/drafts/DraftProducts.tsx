"use client";

/**
 * Карточка ИИ нового товара: описание правится, характеристики и фото — как написал ИИ (поправить можно потом в
 * «Карточках»). Показывается внутри блока своего товара на экране проверки.
 */
import { ChevronRight, ImageOff, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/Textarea";
import { useCardSchema } from "@/features/cards";
import type { DraftCard, SupplyDraft } from "../../api-drafts";
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
        id={`desc-${id}`}
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

/** Карточка нового товара от ИИ внутри его блока: раскрывается тут же, описание правится на месте. */
export function ProductAiCard({ p, draft, edit }: { p: DraftProduct; draft: SupplyDraft; edit: DraftEdit }) {
  const schema = useCardSchema().data;
  const attrs = useMemo(() => new Map((schema?.attributes ?? []).map((a) => [a.key, a])), [schema]);
  const card = draft.cards[p.id];
  return (
    <details className="group rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-3 py-2 text-[13px] font-semibold text-[var(--text)]">
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
        Карточка от ИИ: описание, характеристики, фото
        {!card && <span className="font-normal text-[var(--text-faint)]">· пока нет</span>}
      </summary>
      <div className="border-t border-[var(--line)] p-3">{card ? <Card card={card} id={p.id} edit={edit} attrs={attrs} /> : <NoCard id={p.id} draft={draft} />}</div>
    </details>
  );
}
