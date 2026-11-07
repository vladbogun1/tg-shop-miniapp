"use client";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { Button } from "@shop/ui/admin-button";
import { MoreHorizontal, RefreshCw, Search, Send } from "lucide-react";
import { useState } from "react";
import type { DispatchFilter } from "../model/dispatch";

const CHIPS: { id: DispatchFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "ready", label: "К отправке" },
  { id: "unpaid", label: "Не оплачено" },
  { id: "new", label: "Новые" },
];

const CHIP =
  "nb-chip nb-press focusable inline-flex h-9 shrink-0 snap-start items-center gap-2 px-3 text-[11.5px] uppercase tracking-[0.06em] transition-colors hover:border-[var(--line-strong)] pointer-coarse:h-11";

export interface DispatchToolbarProps {
  phone: boolean;
  filter: DispatchFilter;
  counts: Record<DispatchFilter, number>;
  query: string;
  fetching: boolean;
  broadcasting: boolean;
  /** «Карточки в Telegram» needs at least one approved order. */
  canBroadcast: boolean;
  onFilter: (f: DispatchFilter) => void;
  onQuery: (q: string) => void;
  onRefresh: () => void;
  onBroadcast: () => void;
}

/**
 * Sticky line instead of the old header: filter chips with counters (the unpaid ones are never hidden by
 * default), search by name / phone / #id / city, refresh and «Карточки в Telegram» (a rare action: on a phone
 * it is behind «⋯»).
 */
export function DispatchToolbar(p: DispatchToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheet, setSheet] = useState(false);

  const chips = (
    <nav aria-label="Фильтр" className="thin-scroll flex min-w-0 snap-x gap-2 overflow-x-auto py-0.5 max-lg:flex-1">
      {CHIPS.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={p.filter === c.id}
          onClick={() => p.onFilter(c.id)}
          className={cn(CHIP, p.filter === c.id && "nb-chip-active")}
        >
          {c.label}
          <span className={cn("count-badge", c.id === "unpaid" && p.counts.unpaid > 0 ? "count-badge--danger" : "count-badge--muted")}>
            {p.counts[c.id]}
          </span>
        </button>
      ))}
    </nav>
  );

  const refresh = (
    <Button
      variant="surface"
      className="w-9 px-0 pointer-coarse:w-11"
      icon={<RefreshCw className={cn("h-4 w-4", p.fetching && "animate-spin")} />}
      aria-label="Обновить"
      title="Обновить"
      onClick={p.onRefresh}
    />
  );

  return (
    <div className="sticky top-[var(--hdr-h,61px)] z-20 -mx-4 mb-3 bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 py-2 backdrop-blur-md lg:-mx-7 lg:px-7">
      <div className="flex items-center gap-2">
        {chips}
        {p.phone ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="surface"
              className="w-11 px-0"
              icon={<Search className="h-4 w-4" />}
              aria-label="Поиск"
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            />
            {refresh}
            <Button variant="surface" className="w-11 px-0" icon={<MoreHorizontal className="h-4 w-4" />} aria-label="Ещё" aria-haspopup="dialog" onClick={() => setSheet(true)} />
          </div>
        ) : (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="w-56 xl:w-72">
              <Input
                value={p.query}
                onChange={(e) => p.onQuery(e.target.value)}
                placeholder="Имя, телефон, #id, город"
                aria-label="Поиск по отправке"
                icon={<Search className="h-4 w-4" />}
              />
            </div>
            {refresh}
            <Button
              variant="outline"
              loading={p.broadcasting}
              disabled={!p.canBroadcast}
              icon={<Send className="h-4 w-4" />}
              onClick={p.onBroadcast}
              aria-label="Карточки в Telegram"
              className="max-xl:w-10 max-xl:px-0"
            >
              <span className="max-xl:hidden">Карточки в Telegram</span>
            </Button>
          </div>
        )}
      </div>
      {p.phone && searchOpen && (
        <div className="mt-2">
          <Input
            autoFocus
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            placeholder="Имя, телефон, #id, город"
            aria-label="Поиск по отправке"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
      )}
      <ActionSheet
        open={sheet}
        title="Отправка"
        actions={[
          {
            key: "tg",
            label: "Карточки в Telegram",
            icon: <Send className="h-4 w-4" />,
            disabled: !p.canBroadcast,
            onSelect: p.onBroadcast,
          },
        ]}
        onClose={() => setSheet(false)}
      />
    </div>
  );
}
