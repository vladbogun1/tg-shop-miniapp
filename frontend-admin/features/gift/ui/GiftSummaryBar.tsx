"use client";

/**
 * Строка-сводка настроек подарка: «вкл · кейс · порог · лимит» и значок «!», если подарок не выдастся
 * (нет на складе, скрыт, не выбран). «Настройки» разворачивает полную форму (там же поля, «Не сохранено» и общий бар сохранения).
 */
import { AlertTriangle, ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { money } from "@/lib/money";
import { toMinor } from "@shop/core/money";

function uah(raw: string | boolean | undefined): string | null {
  const n = Number(raw);
  return raw === undefined || raw === "" || !Number.isFinite(n) ? null : money(toMinor(n));
}

export function GiftSummaryBar({
  on,
  isCase,
  threshold,
  monthlyLimit,
  problem,
  dirtyCount,
  open,
  onToggle,
}: {
  on: boolean;
  isCase: boolean;
  /** Сырые значения черновика (то, что сейчас в полях). */
  threshold: string | boolean | undefined;
  monthlyLimit: string | boolean | undefined;
  problem: boolean;
  dirtyCount: number;
  open: boolean;
  onToggle: () => void;
}) {
  const thr = uah(threshold);
  const limit = Number(monthlyLimit) > 0 ? uah(monthlyLimit) : null;
  return (
    <div className="card-2 mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--text-muted)]">
        <span className="font-display font-bold text-[var(--ink)]">Подарок за сумму</span>
        <Badge tone={on ? "ok" : "neutral"} dot>
          {on ? "вкл" : "выкл"}
        </Badge>
        <span>{isCase ? "кейс" : "один товар"}</span>
        {thr && (
          <span className="tabular">
            · {isCase ? "запасной от" : "от"} {thr}
          </span>
        )}
        {on && <span className="tabular">· {limit ? `лимит ${limit} на человека в мес.` : "лимит выключен"}</span>}
        {problem && (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--warn)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            подарок не выдастся
          </span>
        )}
        {dirtyCount > 0 && <Badge tone="accent">Не сохранено: {dirtyCount}</Badge>}
      </div>
      <Button size="sm" variant="surface" className="shrink-0 whitespace-nowrap" icon={<Settings2 className="h-4 w-4" />}
        iconRight={<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />}
        aria-expanded={open}
        onClick={onToggle}
      >
        Настройки
      </Button>
    </div>
  );
}
