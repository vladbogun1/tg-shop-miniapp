"use client";

/**
 * «Карта пользователей» on Пользователи → Аналитика: where visitors were last seen from (their IP
 * → city, offline DB-IP base on the backend), clustered like the Nova Poshta map, plus a live
 * "online now" pill (distinct visitors with events in the last 5 minutes, refreshed every 30 s).
 * Tapping a point lists the signed-in users there (name, IP, channel, when) — a user opens their
 * profile drawer; anonymous site visitors are listed by IP only.
 */
import "./users-map.css";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe2 } from "lucide-react";
import { riseItem } from "@/lib/motion";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { countryCount, GEO_DAY_OPTIONS, locatedVisitors, pointKey, type GeoDaysOption } from "../../model/geo";
import type { GeoPoint, UserCardDto } from "../../model/types";
import { useGeoOverview, useGeoOnline } from "../../queries";
import { PointPanel } from "./PointPanel";

// Leaflet touches `window` on import — client-only, and only when this block is on screen.
const UsersMap = dynamic(() => import("./UsersMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-[8px]" />,
});

function OnlinePill() {
  const { data } = useGeoOnline();
  return (
    <div
      className="inline-flex min-h-8 items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--bg-2)] px-3 py-1 text-[12.5px] text-[var(--text-muted)]"
      title={`Разные посетители с действиями за последние ${data?.windowMinutes ?? 5} мин (примерно)`}
    >
      <span aria-hidden className="um-live shrink-0" />
      <span>
        Онлайн сейчас:{" "}
        <b className="tabular font-display text-[14px] font-bold text-[var(--ink)]">{data ? data.total : "—"}</b>
      </span>
      {data && (
        <span className="tabular whitespace-nowrap text-[var(--text-faint)]">
          (Mini App {data.miniapp} · сайт {data.web})
        </span>
      )}
    </div>
  );
}

function MapNotice({ isError, geoAvailable }: { isError: boolean; geoAvailable: boolean | undefined }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1000] flex justify-center px-3">
      <span className="max-w-[440px] rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[rgba(14,14,16,.9)] px-3 py-2 text-center text-[12px] text-[var(--text-muted)] backdrop-blur-sm">
        {isError
          ? "Не удалось загрузить карту"
          : !geoAvailable
            ? "На сервере нет базы геолокации (DB-IP) — точки не рисуются. IP всё равно запоминаются."
            : "За этот период ещё нет посетителей с известным местом"}
      </span>
    </div>
  );
}

export function UsersMapBlock({ onOpenUser }: { onOpenUser: (u: UserCardDto) => void }) {
  const [days, setDays] = useState<GeoDaysOption>("30");
  const [active, setActive] = useState<GeoPoint | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const d = Number(days);

  const { data, isLoading, isError } = useGeoOverview(d);
  const points = useMemo(() => data?.points ?? [], [data]);
  const located = useMemo(() => locatedVisitors(points), [points]);
  const countries = useMemo(() => countryCount(points), [points]);
  const onPick = useCallback((p: GeoPoint) => setActive(p), []);

  return (
    <motion.section variants={riseItem} initial="initial" animate="animate" className="panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="section-title flex items-center gap-2">
          <span aria-hidden className="h-3.5 w-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]" />
          Карта пользователей
        </h3>
        <OnlinePill />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<GeoDaysOption>
          size="sm"
          options={GEO_DAY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={days}
          onChange={(v) => {
            setDays(v);
            setActive(null);
          }}
        />
        <div className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
          <span>
            На карте: <b className="text-[var(--text)]">{located}</b>
          </span>
          <span>
            Городов: <b className="text-[var(--text)]">{points.length}</b>
          </span>
          <span>
            Стран: <b className="text-[var(--text)]">{countries}</b>
          </span>
          {!!data?.withoutLocation && (
            <span title="Посетители, чей IP база не смогла привязать к городу (или база не установлена)">
              Без места: <b className="text-[var(--text)]">{data.withoutLocation}</b>
            </span>
          )}
        </div>
      </div>

      <div
        className="relative isolate overflow-hidden rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--bg-2)] p-1"
        style={{ height: "min(560px, 62vh)", minHeight: 340 }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[8px]">
          {isLoading && !data ? (
            <Skeleton className="h-full w-full rounded-[8px]" />
          ) : (
            <UsersMap points={points} activeKey={active ? pointKey(active) : null} onPick={onPick} resetKey={resetKey} />
          )}

          <button
            type="button"
            onClick={() => {
              setActive(null);
              setResetKey((k) => k + 1);
            }}
            className="absolute right-2 top-2 z-[1000] inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[rgba(26,26,26,.92)] px-2.5 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text)] backdrop-blur-sm transition-colors hover:bg-[var(--surface-hover)] pointer-coarse:h-9"
          >
            <Globe2 className="h-3.5 w-3.5" /> Весь мир
          </button>

          {(isError || (data && (!data.geoAvailable || points.length === 0))) && (
            <MapNotice isError={isError} geoAvailable={data?.geoAvailable} />
          )}

          <AnimatePresence>
            {active && (
              <PointPanel
                key={pointKey(active)}
                point={active}
                days={d}
                onClose={() => setActive(null)}
                onOpenUser={onOpenUser}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}
