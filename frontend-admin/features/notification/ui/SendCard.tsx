"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { LANG_LABEL } from "@/lib/shop-lang";
import { riseItem } from "@/lib/motion";
import { LOCALES } from "@shop/core/i18n";
import type { BroadcastStatus } from "../api";
import { AUDIENCE_LABEL } from "../model/compose";
import type { BroadcastAudience, ShopLang } from "../model/types";
import { BroadcastProgress } from "./BroadcastProgress";
import { SendButton } from "./SendButton";
import type { Compose } from "./use-compose";

interface Props {
  c: Compose;
  audiences: Record<BroadcastAudience, number> | undefined;
  status: BroadcastStatus | undefined;
  starting: boolean;
  count: number;
  reason: string;
  /** На телефоне кнопка живёт в нижней панели экрана. */
  showSend: boolean;
  onRequest: () => void;
}

/** Карточка «Кому»: аудитория чипами с числами, язык, «Разослать» (на ПК) и прогресс. */
export function SendCard({ c, audiences, status, starting, count, reason, showSend, onRequest }: Props) {
  const { values } = c;
  const running = status?.running ?? false;
  const audienceOptions = (Object.keys(AUDIENCE_LABEL) as BroadcastAudience[]).map((a) => ({
    value: a,
    label: `${AUDIENCE_LABEL[a]}${audiences ? ` · ${audiences[a]}` : ""}`,
  }));
  return (
    <motion.div variants={riseItem} className="card flex flex-col gap-3 p-5">
      <div className="section-title flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Users className="h-4 w-4 text-[var(--accent)]" />
        Кому
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="field-label">Аудитория</span>
        <SegmentedControl<BroadcastAudience> size="sm" options={audienceOptions} value={values.audience} onChange={(v) => c.setField("audience", v)} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <Select<string>
            label="Язык покупателя"
            value={values.lang}
            onChange={(v) => c.setField("lang", v as ShopLang | "")}
            options={[{ value: "", label: "Все языки" }, ...LOCALES.map((l) => ({ value: l, label: LANG_LABEL[l] }))]}
          />
        </div>
        {showSend && <SendButton count={count} reason={reason} running={running} starting={starting} onClick={onRequest} />}
      </div>
      {showSend && reason && <p className="text-[12px] font-semibold text-[var(--text-muted)]">{reason}</p>}
      <p className="text-[11px] text-[var(--text-faint)]">
        Язык — выбранный покупателем в магазине; если не выбирал — язык Telegram, иначе украинский.
      </p>

      {status && (status.running || status.total > 0) && (
        <BroadcastProgress
          running={status.running}
          total={status.total}
          sent={status.sent}
          failed={status.failed}
          blocked={status.blocked}
          stopRequested={status.stopRequested}
          stopped={status.stopped}
          stoppedBy={status.stoppedBy}
        />
      )}
    </motion.div>
  );
}
