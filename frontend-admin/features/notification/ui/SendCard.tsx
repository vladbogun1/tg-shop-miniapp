"use client";

import { Button } from "@shop/ui/admin-button";
import { motion } from "framer-motion";
import { Send, Users } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { LANG_LABEL } from "@/lib/shop-lang";
import { riseItem } from "@/lib/motion";
import type { BroadcastStatus } from "../api";
import { AUDIENCE_LABEL } from "../model/compose";
import type { BroadcastAudience, ShopLang } from "../model/types";
import { BroadcastProgress } from "./BroadcastProgress";
import type { Compose } from "./use-compose";

interface Props {
  c: Compose;
  audiences: Record<BroadcastAudience, number> | undefined;
  status: BroadcastStatus | undefined;
  starting: boolean;
  onRequest: () => void;
}

/** Карточка «Рассылка»: аудитория, язык, кнопка «Разослать» и прогресс. */
export function SendCard({ c, audiences, status, starting, onRequest }: Props) {
  const { values } = c;
  const running = status?.running ?? false;
  const audienceOptions = (Object.keys(AUDIENCE_LABEL) as BroadcastAudience[]).map((a) => ({
    value: a,
    label: `${AUDIENCE_LABEL[a]}${audiences ? ` · ${audiences[a]}` : ""}`,
  }));
  const audienceCount = audiences?.[values.audience] ?? 0;
  return (
    <motion.div variants={riseItem} className="card mt-4 flex flex-col gap-3 p-5">
      <div className="section-title flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Users className="h-4 w-4 text-[var(--accent)]" />
        Рассылка
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Select label="Аудитория" value={values.audience} options={audienceOptions} onChange={(v) => c.setField("audience", v)} />
        </div>
        <div className="min-w-[180px] flex-1">
          <Select<string>
            label="Язык покупателя"
            value={values.lang}
            onChange={(v) => c.setField("lang", v as ShopLang | "")}
            options={[
              { value: "", label: "Все языки" },
              { value: "uk", label: LANG_LABEL.uk },
              { value: "ru", label: LANG_LABEL.ru },
              { value: "en", label: LANG_LABEL.en },
            ]}
          />
        </div>
        <Button
          variant="accent"
          chamfer
          loading={starting}
          disabled={running || audienceCount === 0 || !c.ok}
          onClick={onRequest}
          icon={<Send className="h-4 w-4" />}
        >
          Разослать ({audienceCount})
        </Button>
      </div>
      <p className="text-[11px] text-[var(--text-faint)]">
        Язык — выбранный покупателем в магазине; если не выбирал — язык Telegram, иначе украинский.
      </p>

      {status && (status.running || status.total > 0) && (
        <BroadcastProgress running={status.running} total={status.total} sent={status.sent} failed={status.failed} blocked={status.blocked} />
      )}
    </motion.div>
  );
}
