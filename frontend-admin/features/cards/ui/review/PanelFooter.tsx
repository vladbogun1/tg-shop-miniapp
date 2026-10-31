"use client";

import { Check as CheckIcon, ChevronLeft, ChevronRight, ExternalLink, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@shop/ui/admin-button";
import type { CardTab } from "../../model/view";
import { NavButton } from "./parts";

interface FooterProps {
  tab: CardTab;
  dirty: boolean;
  busy: "accept" | "back" | null;
  position: { index: number; total: number };
  editorHref: string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onReAi: () => void;
  onAccept: () => void;
  onSaveEdits: () => void;
  onSendBack: () => void;
}

/** Главная кнопка по состоянию: принять / сохранить правки / вернуть на проверку. */
function PrimaryAction({ tab, dirty, busy, onAccept, onSaveEdits, onSendBack }: Pick<FooterProps, "tab" | "dirty" | "busy" | "onAccept" | "onSaveEdits" | "onSendBack">) {
  if (tab !== "ready")
    return (
      <Button
        variant="accent"
        chamfer
        icon={<CheckIcon className="h-4 w-4" />}
        loading={busy === "accept"}
        onClick={onAccept}
        title="Принять карточку (A): правки сохранятся, карточка уйдёт в «Готово»"
        className="max-sm:w-full"
      >
        {dirty ? "Сохранить и принять" : "Принять"}
        <kbd aria-hidden className="ml-1 hidden rounded-[3px] border border-[rgba(14,14,16,.25)] px-1 font-mono text-[10px] leading-[14px] sm:inline">A</kbd>
      </Button>
    );
  if (dirty)
    return (
      <Button variant="accent" icon={<CheckIcon className="h-4 w-4" />} loading={busy === "accept"} onClick={onSaveEdits}>
        Сохранить правки
      </Button>
    );
  return (
    <Button variant="surface" icon={<RotateCcw className="h-4 w-4" />} loading={busy === "back"} onClick={onSendBack}>
      Вернуть на проверку
    </Button>
  );
}

/** Низ панели: листание, «В редакторе», «Переоформить с ИИ» и главная кнопка. */
export function PanelFooter(p: FooterProps) {
  const { tab, position, editorHref, onPrev, onNext, onReAi } = p;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 pt-3 pb-[calc(12px+var(--safe-bottom))] sm:px-5">
      <div className="flex items-center gap-1">
        <NavButton label="Предыдущая (K)" disabled={!onPrev} onClick={() => onPrev?.()}>
          <ChevronLeft className="h-4 w-4" />
        </NavButton>
        <span className="tabular min-w-[52px] text-center text-[12px] font-semibold text-[var(--text-faint)]">
          {position.index} / {position.total}
        </span>
        <NavButton label="Следующая (J)" disabled={!onNext} onClick={() => onNext?.()}>
          <ChevronRight className="h-4 w-4" />
        </NavButton>
      </div>
      <span className="flex-1" />
      <Link
        href={editorHref}
        target="_blank"
        title="Открыть товар в редакторе на шаге «Характеристики» (новая вкладка)"
        aria-label="Открыть в редакторе"
        className="focusable inline-flex h-10 min-w-11 items-center justify-center gap-1.5 rounded-[var(--r-md)] px-3 font-display text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] pointer-coarse:h-11"
      >
        <span className="max-sm:hidden">В редакторе</span> <ExternalLink className="h-3.5 w-3.5" />
      </Link>
      <Button
        variant="outline"
        icon={<Sparkles className="h-4 w-4" />}
        onClick={onReAi}
        aria-label={tab === "draft" ? "Оформить с ИИ" : "Переоформить с ИИ"}
        title={tab === "draft" ? "Оформить с ИИ" : "Переоформить с ИИ"}
      >
        <span className="max-sm:hidden">{tab === "draft" ? "Оформить с ИИ" : "Переоформить"}</span>
      </Button>
      <PrimaryAction tab={tab} dirty={p.dirty} busy={p.busy} onAccept={p.onAccept} onSaveEdits={p.onSaveEdits} onSendBack={p.onSendBack} />
    </div>
  );
}
