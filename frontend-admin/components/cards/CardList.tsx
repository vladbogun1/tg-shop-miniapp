"use client";

/**
 * The list of «Карточки»: one row per product of the current tab, a checkbox per row (+ «выбрать
 * все»), a click opens the review panel. Badges: hidden / new, «ИИ N %» (overall confidence of
 * the AI) and «нет N полей» (required characteristics missing, listed in the tooltip).
 */
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, EyeOff } from "lucide-react";
import type { CSSProperties } from "react";
import { categoryPathName, type CardItem, type CardSchema } from "@/lib/card-prompt";
import { fieldsWord, metaOf, missingCount, missingLabels, tabOf } from "@/lib/cards-view";
import { cn } from "@/lib/cn";
import { Check, ConfidencePill, fmtDate, Thumb } from "@/components/cards/shared";

export function CardList({
  items,
  schema,
  selected,
  onToggle,
  onToggleAll,
  activeId,
  onOpen,
  limit,
}: {
  items: CardItem[];
  schema: CardSchema | undefined;
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  /** The row whose review panel is open. */
  activeId: string | null;
  onOpen: (id: string) => void;
  limit: number;
}) {
  const shown = items.slice(0, limit);
  const allOn = items.length > 0 && items.every((i) => selected.has(i.id));
  const someOn = !allOn && items.some((i) => selected.has(i.id));

  return (
    <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 sm:px-4">
        <input
          type="checkbox"
          aria-label="Выбрать все в списке"
          title="Выбрать все в списке"
          className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
          checked={allOn}
          ref={(el) => {
            if (el) el.indeterminate = someOn;
          }}
          onChange={(e) => onToggleAll(e.target.checked)}
        />
        <span className="field-label !text-[10.5px]">
          {selected.size > 0 ? `Выбрано ${selected.size}` : `Товаров: ${items.length}`}
        </span>
      </div>
      <ul>
        <AnimatePresence initial={false}>
          {shown.map((it) => (
            <motion.li
              key={it.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              className="border-b border-[var(--line)] last:border-b-0"
            >
              <Row
                it={it}
                schema={schema}
                checked={selected.has(it.id)}
                active={activeId === it.id}
                onToggle={(on) => onToggle(it.id, on)}
                onOpen={() => onOpen(it.id)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function Row({
  it,
  schema,
  checked,
  active,
  onToggle,
  onOpen,
}: {
  it: CardItem;
  schema: CardSchema | undefined;
  checked: boolean;
  active: boolean;
  onToggle: (on: boolean) => void;
  onOpen: () => void;
}) {
  const meta = metaOf(it);
  const tab = tabOf(it);
  const missing = missingCount(it);
  const when = tab === "ready" ? fmtDate(meta.reviewedAt) : tab === "review" ? fmtDate(meta.importedAt) : null;
  const category = (schema && categoryPathName(schema, it.categorySlug)) || it.categorySlug || "без категории";
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-3 py-2 transition-colors sm:px-4",
        active ? "bg-[var(--accent-soft)]" : checked ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-hover)]"
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-[var(--accent)]" />}
      {/* The checkbox gets its own 40px hit area so a near miss does not open the panel. */}
      <label className="-m-3 grid shrink-0 cursor-pointer place-items-center p-3" onClick={(e) => e.stopPropagation()}>
        <Check checked={checked} onChange={onToggle} label={`Выбрать ${it.title}`} />
      </label>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active || undefined}
        className="focusable flex min-w-0 flex-1 items-center gap-3 rounded-[var(--r-md)] text-left"
      >
        <Thumb src={it.imageUrl} alt={it.title} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-[var(--text)]" title={it.title}>
            {it.title}
          </span>
          <span className="block truncate text-[11.5px] text-[var(--text-faint)]">
            {category}
            {it.brand ? ` · ${it.brand}` : ""}
            {when ? (tab === "ready" ? ` · проверено ${when}` : ` · от ИИ ${when}`) : ""}
          </span>
          {/* Badges under the title on a phone, on the right from sm up. */}
          <span className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
            <Badges it={it} schema={schema} missing={missing} />
          </span>
        </span>
        <span className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
          <Badges it={it} schema={schema} missing={missing} />
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-muted)]",
            active && "text-[var(--accent-hi)]"
          )}
        />
      </button>
    </div>
  );
}

function Badges({ it, schema, missing }: { it: CardItem; schema: CardSchema | undefined; missing: number }) {
  return (
    <>
      {it.unfinished === true ? (
        <span
          className="chip-tint !px-2 !text-[10px] !leading-[16px]"
          style={{ "--chip": "var(--warn)" } as CSSProperties}
          title="Новый товар: сохранён скрытым, покупатели его не видят, пока карточка не оформлена"
        >
          <EyeOff className="h-3 w-3" /> новый, скрыт
        </span>
      ) : it.active !== true ? (
        <span className="chip-tint !bg-[var(--surface-3)] !px-2 !text-[10px] !leading-[16px]" style={{ "--chip": "var(--text-muted)" } as CSSProperties} title="Снят с витрины">
          <EyeOff className="h-3 w-3" /> скрыт
        </span>
      ) : null}
      {it.cardConfidence != null && tabOf(it) !== "draft" && <ConfidencePill value={it.cardConfidence} label="ИИ" />}
      {missing > 0 && (
        <span
          className="chip-tint !px-2 !text-[10px] !leading-[16px]"
          style={{ "--chip": "var(--warn)" } as CSSProperties}
          title={`Не заполнены обязательные характеристики: ${missingLabels(schema, it).join(", ")}`}
        >
          нет {missing} {fieldsWord(missing)}
        </span>
      )}
    </>
  );
}
