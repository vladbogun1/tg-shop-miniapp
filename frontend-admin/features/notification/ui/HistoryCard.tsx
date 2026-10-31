"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { LANG_LABEL } from "@/lib/shop-lang";
import { riseItem } from "@/lib/motion";
import { formatDateTime } from "@shop/core/time";
import { AUDIENCE_LABEL, plainText } from "../model/compose";
import type { BroadcastHistoryItem } from "../model/types";

function StatusBadge({ status }: { status: BroadcastHistoryItem["status"] }) {
  if (status === "RUNNING") return <Badge tone="info">идёт</Badge>;
  if (status === "INTERRUPTED") return <Badge tone="warn">прервана</Badge>;
  return <Badge tone="ok">готово</Badge>;
}

function HistoryRow({ h, onReuse }: { h: BroadcastHistoryItem; onReuse: () => void }) {
  const versions = [h.textUk && "UA", h.textRu && "RU", h.textEn && "EN"].filter(Boolean);
  return (
    <div className="card-2 flex min-w-0 flex-col gap-1.5 rounded-[var(--r-md)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="tabular font-semibold text-[var(--text)]">{formatDateTime(h.startedAt)}</span>
        <StatusBadge status={h.status} />
        <span className="text-[var(--text-muted)]">
          {AUDIENCE_LABEL[h.audience] ?? h.audience}
          {h.lang ? ` · ${LANG_LABEL[h.lang]}` : ""}
          {versions.length ? ` · версии ${versions.join(", ")}` : ""}
        </span>
        {h.adminName && <span className="text-[var(--text-faint)]">· {h.adminName}</span>}
      </div>
      <p className="line-clamp-2 break-words text-[13px] text-[var(--text)]">{plainText(h.text)}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="flex flex-wrap gap-3">
          <span className="text-[var(--ok)]">✓ {h.sent}</span>
          <span className="text-[var(--danger-ink)]">✕ {h.failed}</span>
          <span className="text-[var(--warn)]">⊘ {h.blocked}</span>
          <span className="text-[var(--text-muted)]">из {h.total}</span>
        </span>
        <button
          type="button"
          onClick={onReuse}
          className="hit font-display text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
        >
          В черновик
        </button>
      </div>
    </div>
  );
}

function HistoryBody({ q, onReuse }: { q: UseQueryResult<BroadcastHistoryItem[]>; onReuse: (h: BroadcastHistoryItem) => void }) {
  const rows = q.data ?? [];
  if (q.isError) {
    return (
      <p className="text-[13px] text-[var(--danger-ink)]">
        Не удалось загрузить историю.{" "}
        <button type="button" className="font-semibold text-[var(--accent-hi)] hover:underline" onClick={() => q.refetch()}>
          Повторить
        </button>
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-[var(--text-faint)]">
        {q.isLoading ? "Загружаем…" : "Пока ни одной рассылки (история ведётся с этой версии)."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((h) => (
        <HistoryRow key={h.id} h={h} onReuse={() => onReuse(h)} />
      ))}
    </div>
  );
}

/** Карточка «Прошлые рассылки». */
export function HistoryCard({ q, onReuse }: { q: UseQueryResult<BroadcastHistoryItem[]>; onReuse: (h: BroadcastHistoryItem) => void }) {
  return (
    <motion.div variants={riseItem} className="card mt-4 flex min-w-0 flex-col gap-3 p-5">
      <div className="section-title flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <History className="h-4 w-4 text-[var(--accent)]" />
        Прошлые рассылки
      </div>
      <HistoryBody q={q} onReuse={onReuse} />
    </motion.div>
  );
}
