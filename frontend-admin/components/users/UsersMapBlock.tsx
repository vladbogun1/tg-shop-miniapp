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
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Globe2, MapPin, X, Smartphone, Monitor, ChevronRight } from "lucide-react";
import type { UserCardDto } from "@/lib/api";
import { timeAgo } from "@/lib/orders";
import { riseItem, sheetVariants } from "@/lib/motion";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { geoApi, type GeoPoint } from "./geo-api";

// Leaflet touches `window` on import — client-only, and only when this block is on screen.
const UsersMap = dynamic(() => import("./UsersMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-[8px]" />,
});

const DAY_OPTIONS = [
  { value: "1", label: "24 ч" },
  { value: "7", label: "7 дн" },
  { value: "30", label: "30 дн" },
  { value: "90", label: "90 дн" },
] as const;
type DaysOpt = (typeof DAY_OPTIONS)[number]["value"];

const keyOf = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`;

function placeName(p: { city: string | null; country: string | null }): string {
  return [p.city, p.country].filter(Boolean).join(", ") || "Неизвестно";
}

function userName(u: UserCardDto): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || (u.username ? "@" + u.username : "#" + u.telegramUserId);
}

export function OnlinePill() {
  const { data } = useQuery({
    queryKey: ["users-geo-online"],
    queryFn: geoApi.online,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
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

export function UsersMapBlock({ onOpenUser }: { onOpenUser: (u: UserCardDto) => void }) {
  const [days, setDays] = useState<DaysOpt>("30");
  const [active, setActive] = useState<GeoPoint | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const d = Number(days);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["users-geo", d],
    queryFn: () => geoApi.overview(d),
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
  });
  const points = useMemo(() => data?.points ?? [], [data]);
  const located = useMemo(() => points.reduce((a, p) => a + p.visitors, 0), [points]);
  const countries = useMemo(() => new Set(points.map((p) => p.countryCode).filter(Boolean)).size, [points]);
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
        <SegmentedControl<DaysOpt>
          size="sm"
          options={DAY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
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
            <UsersMap
              points={points}
              activeKey={active ? keyOf(active) : null}
              onPick={onPick}
              resetKey={resetKey}
            />
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
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1000] flex justify-center px-3">
              <span className="max-w-[440px] rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[rgba(14,14,16,.9)] px-3 py-2 text-center text-[12px] text-[var(--text-muted)] backdrop-blur-sm">
                {isError
                  ? "Не удалось загрузить карту"
                  : !data?.geoAvailable
                    ? "На сервере нет базы геолокации (DB-IP) — точки не рисуются. IP всё равно запоминаются."
                    : "За этот период ещё нет посетителей с известным местом"}
              </span>
            </div>
          )}

          <AnimatePresence>
            {active && (
              <PointPanel
                key={keyOf(active)}
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

function PointPanel({
  point,
  days,
  onClose,
  onOpenUser,
}: {
  point: GeoPoint;
  days: number;
  onClose: () => void;
  onOpenUser: (u: UserCardDto) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["users-geo-point", point.lat, point.lon, days],
    queryFn: () => geoApi.point(point.lat, point.lon, days),
  });

  return (
    <motion.div
      variants={sheetVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="absolute inset-x-2 bottom-2 z-[1001] flex max-h-[72%] flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-3)] lg:inset-x-auto lg:bottom-2 lg:right-2 lg:top-12 lg:max-h-none lg:w-[360px]"
    >
      <div className="flex items-start gap-3 border-b border-[var(--line)] p-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]">
          <MapPin className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-[var(--ink)]">{placeName(point)}</div>
          <div className="tabular mt-0.5 text-[12px] text-[var(--text-muted)]">
            {point.visitors} посет. · с аккаунтом {point.users} · анонимно {point.anonymous}
          </div>
          <div className="tabular text-[11.5px] text-[var(--text-faint)]">
            Mini App {point.miniapp} · сайт {point.web}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] transition-transform active:scale-[.96] pointer-coarse:h-9 pointer-coarse:w-9"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {isLoading && (
          <div className="flex flex-col gap-2 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-[var(--r-md)]" />
            ))}
          </div>
        )}
        {isError && <p className="p-2 text-[12.5px] text-[var(--danger-ink)]">Не удалось загрузить список</p>}
        {data && (
          <>
            {data.users.length > 0 && (
              <ul className="flex flex-col gap-1">
                {data.users.map((u) => (
                  <li key={u.user.telegramUserId}>
                    <button
                      type="button"
                      onClick={() => onOpenUser(u.user)}
                      className="group flex w-full items-center gap-2.5 rounded-[var(--r-md)] px-2 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--text-muted)]">
                        {u.channel === "WEB" ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[var(--text)]">
                          {userName(u.user)}
                          {u.user.username && (u.user.firstName || u.user.lastName) && (
                            <span className="ml-1.5 font-normal text-[var(--text-faint)]">@{u.user.username}</span>
                          )}
                        </span>
                        <span className="tabular block truncate text-[11.5px] text-[var(--text-muted)]">
                          {u.ip} · {u.channel === "WEB" ? "сайт" : "Mini App"}
                          {u.seenAt ? ` · ${timeAgo(u.seenAt)}` : ""}
                        </span>
                      </span>
                      {u.user.ordersCount > 0 && (
                        <Badge tone="accent" className="shrink-0">
                          {u.user.ordersCount} зак.
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {data.anonymousTotal > 0 && (
              <div className="mt-2 border-t border-[var(--line)] px-2 pt-2">
                <div className="field-label mb-1.5">Без входа (сайт): {data.anonymousTotal}</div>
                <ul className="tabular flex flex-col gap-0.5 text-[12px] text-[var(--text-muted)]">
                  {data.anonymous.map((a, i) => (
                    <li key={a.ip + i} className="flex justify-between gap-3">
                      <span className="truncate">{a.ip}</span>
                      <span className="shrink-0 text-[var(--text-faint)]">{a.seenAt ? timeAgo(a.seenAt) : ""}</span>
                    </li>
                  ))}
                  {data.anonymousTotal > data.anonymous.length && (
                    <li className="text-[var(--text-faint)]">… и ещё {data.anonymousTotal - data.anonymous.length}</li>
                  )}
                </ul>
              </div>
            )}
            {data.users.length === 0 && data.anonymousTotal === 0 && (
              <p className="p-2 text-[12.5px] text-[var(--text-muted)]">За период здесь никого нет</p>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
