"use client";

import { motion } from "framer-motion";
import { MapPin, X, Smartphone, Monitor, ChevronRight } from "lucide-react";
import { sheetVariants } from "@shop/ui/overlay";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { timeAgo } from "@shop/core/time";
import { placeName } from "../../model/geo";
import type { GeoPoint, GeoPointDetails, UserCardDto } from "../../model/types";
import { displayName } from "../../model/user";
import { useGeoPoint } from "../../queries";

function PointHeader({ point, onClose }: { point: GeoPoint; onClose: () => void }) {
  return (
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
  );
}

function PointUsers({ users, onOpenUser }: { users: GeoPointDetails["users"]; onOpenUser: (u: UserCardDto) => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {users.map((u) => (
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
                {displayName(u.user)}
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
  );
}

function PointAnonymous({ data }: { data: GeoPointDetails }) {
  return (
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
  );
}

export function PointPanel({
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
  const { data, isLoading, isError } = useGeoPoint(point.lat, point.lon, days);

  return (
    <motion.div
      variants={sheetVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="absolute inset-x-2 bottom-2 z-[1001] flex max-h-[72%] flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-3)] lg:inset-x-auto lg:bottom-2 lg:right-2 lg:top-12 lg:max-h-none lg:w-[360px]"
    >
      <PointHeader point={point} onClose={onClose} />

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
            {data.users.length > 0 && <PointUsers users={data.users} onOpenUser={onOpenUser} />}
            {data.anonymousTotal > 0 && <PointAnonymous data={data} />}
            {data.users.length === 0 && data.anonymousTotal === 0 && (
              <p className="p-2 text-[12.5px] text-[var(--text-muted)]">За период здесь никого нет</p>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
