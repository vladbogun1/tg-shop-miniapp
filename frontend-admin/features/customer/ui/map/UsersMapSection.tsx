"use client";

/**
 * Карта на «Аналитике»: по умолчанию свёрнута в одну строку (точек, городов, онлайн), но «Онлайн сейчас»
 * с разбивкой по каналам остаётся видимым и обновляется (опрос раз в 30 с не останавливается). «Показать карту»
 * разворачивает прежний блок целиком — период, счётчики, «Весь мир», панель точки и все сообщения о пустоте.
 */
import { ChevronDown, Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { countryCount, locatedVisitors } from "../../model/geo";
import type { UserCardDto } from "../../model/types";
import { useGeoOverview } from "../../queries";
import { OnlinePill, UsersMapBlock } from "./UsersMapBlock";

function MapSummary({ onOpen }: { onOpen: () => void }) {
  const { data } = useGeoOverview(30);
  const points = data?.points ?? [];
  return (
    <section className="panel flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="section-title flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-[var(--accent)]" />
          Карта пользователей
        </h3>
        {data && (
          <span className="tabular text-[12.5px] text-[var(--text-muted)]">
            {locatedVisitors(points)} на карте · {points.length} городов · {countryCount(points)} стран (30 дн)
          </span>
        )}
        <OnlinePill />
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="focusable hit font-display inline-flex h-9 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] px-3.5 text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--text)] hover:bg-[var(--surface-3)] pointer-coarse:h-11 max-sm:w-full max-sm:justify-center"
      >
        Показать карту <ChevronDown className="h-4 w-4" />
      </button>
    </section>
  );
}

export function UsersMapSection({ onOpenUser }: { onOpenUser: (u: UserCardDto) => void }) {
  const [open, setOpen] = useState(false);
  return open ? <UsersMapBlock onOpenUser={onOpenUser} onCollapse={() => setOpen(false)} /> : <MapSummary onOpen={() => setOpen(true)} />;
}
