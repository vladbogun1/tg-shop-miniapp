"use client";

/** Блоки проверки ответа ИИ про карточку: предложения новых опций схемы, источники и заметки ИИ. */
import { ExternalLink, Lightbulb, MessageSquareText, Plus } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import type { Proposal, ProductReview } from "../model";
import { host } from "./shared";

/** Почему нельзя добавить опцию в схему (или подсказка, что кнопка добавит). */
function addOptionHint(p: Proposal, canAdd: boolean): string {
  if (canAdd) return "Добавить опцию в схему категории и проверить ответ заново";
  if (!p.attr) return "Нет такой характеристики в схеме категории";
  if (p.attr.type !== "enum" && p.attr.type !== "multi") return "У этой характеристики нет списка опций";
  return "Схема загружена без id атрибутов — добавьте опцию в «Категориях»";
}

/** Предложения ИИ новых опций, которых нет в схеме, с кнопкой «Добавить опцию в схему». */
export function ProposalsBox({ proposals, onAddOption }: { proposals: Proposal[]; onAddOption: (p: Proposal) => void }) {
  if (proposals.length === 0) return null;
  return (
    <div className="mt-3 rounded-[var(--r-md)] border border-[rgba(255,102,0,.28)] bg-[var(--accent-soft)] p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-[var(--accent-hi)]" />
        <span className="font-display text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)]">Новые опции — нет в схеме</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {proposals.map((p, i) => {
          const canAdd = !!p.attr?.id && (p.attr.type === "enum" || p.attr.type === "multi");
          return (
            <li key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-[var(--text-muted)]">{p.attr?.labelRu ?? p.key}:</span>
              <b className="text-[var(--text)]">«{p.value}»</b>
              {p.why && <span className="text-[12px] text-[var(--text-faint)]">— {p.why}</span>}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                icon={<Plus className="h-3.5 w-3.5" />}
                disabled={!canAdd}
                title={addOptionHint(p, canAdd)}
                onClick={() => onAddOption(p)}
              >
                Добавить опцию в схему
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Источники и заметки ИИ по товару. */
export function SourcesBox({ r }: { r: ProductReview }) {
  if (!(r.sources.length > 0 || r.notes)) return null;
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      {r.sources.length > 0 && (
        <div>
          <div className="field-label mb-1 !text-[11px] !text-[var(--text-faint)]">Источники</div>
          <ul className="flex flex-col gap-0.5">
            {r.sources.map((s, i) => (
              <li key={i} className="min-w-0">
                <a
                  href={s}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={s}
                  className="inline-flex max-w-full items-center gap-1 text-[12.5px] font-semibold text-[var(--info)] hover:underline"
                >
                  <span className="truncate">{host(s)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.notes && (
        <div>
          <div className="field-label mb-1 flex items-center gap-1 !text-[11px] !text-[var(--text-faint)]">
            <MessageSquareText className="h-3.5 w-3.5" /> Заметки ИИ
          </div>
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">{r.notes}</div>
        </div>
      )}
    </div>
  );
}
