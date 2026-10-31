"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { CircleAlert, CircleCheck, CircleDashed, Clock, RefreshCw, ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import { ApiError } from "@shop/core/errors";
import { formatDateTime, timeAgo } from "@shop/core/time";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MonobankStatus } from "../model/types";

type MonoState = { tone: "ok" | "warn" | "danger"; label: string; icon: typeof Clock; text: ReactNode };

function monoState(s: MonobankStatus): MonoState {
  if (!s.enabled) {
    return {
      tone: "warn",
      label: "Не настроено",
      icon: CircleDashed,
      text: (
        <>
          <span className="font-mono text-[12px]">MONOBANK_TOKEN</span> на сервере пуст — покупатели не смогут
          оплатить заказ. Токен выдаётся в web.monobank.ua → «Інтернет-еквайринг» и прописывается в .env сервера.
        </>
      ),
    };
  }
  if (s.error) {
    return { tone: "danger", label: "Ошибка", icon: CircleAlert, text: <>monobank ответил ошибкой: {s.error}</> };
  }
  return {
    tone: "ok",
    label: "Подключено",
    icon: CircleCheck,
    text: s.merchantName ? (
      <>
        Магазин в monobank: <b className="font-semibold text-[var(--text)]">{s.merchantName}</b>
      </>
    ) : (
      <>Токен принят monobank.</>
    ),
  };
}

const TONE_VAR: Record<MonoState["tone"] | "neutral", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "#F87171",
  neutral: "var(--text-muted)",
};

/** monobank acquiring: connected / not configured / error, and the last webhook. */
export function MonobankCard({
  status,
  loading,
  error,
  fetching,
  onRefresh,
}: {
  status?: MonobankStatus;
  loading: boolean;
  error: unknown;
  fetching: boolean;
  onRefresh: () => void;
}) {
  const st = status ? monoState(status) : null;
  const toneVar = TONE_VAR[st?.tone ?? "neutral"];
  const StIcon = st?.icon;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ease}
      aria-label="Эквайринг monobank"
      className="panel mb-6 min-w-0 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border"
          style={{
            color: toneVar,
            background: `color-mix(in srgb, ${toneVar} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${toneVar} 30%, transparent)`,
          }}
        >
          <Wallet className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="section-title !text-[15px] text-[var(--ink)]">Эквайринг monobank</h2>
            {st && StIcon && (
              <Badge tone={st.tone}>
                <StIcon className="h-3 w-3" />
                {st.label}
              </Badge>
            )}
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-10 max-w-md rounded-[var(--r-md)]" />
          ) : error || !status || !st ? (
            <p className="mt-1 text-[13px] text-[var(--danger-ink)]">
              Статус не загрузился{error instanceof ApiError ? `: ${error.message}` : ""}.
            </p>
          ) : (
            <div className="mt-1 flex flex-col gap-1.5 text-[13px] leading-snug text-[var(--text-muted)]">
              <p className="break-words">{st.text}</p>
              <WebhookLine status={status} />
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />}
          onClick={onRefresh}
          disabled={fetching}
        >
          Проверить
        </Button>
      </div>
    </motion.section>
  );
}

/** Последний вебхук monobank: когда пришёл и сошлась ли подпись. */
function WebhookLine({ status }: { status: MonobankStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {status.lastWebhookAt ? (
        <>
          <span>
            Последний вебхук:{" "}
            <span className="tabular text-[var(--text)]">{formatDateTime(status.lastWebhookAt)}</span>{" "}
            <span className="text-[var(--text-faint)]">({timeAgo(status.lastWebhookAt)})</span>
          </span>
          {status.lastWebhookSignatureOk === true && (
            <Badge tone="ok">
              <ShieldCheck className="h-3 w-3" />
              подпись верна
            </Badge>
          )}
          {status.lastWebhookSignatureOk === false && (
            <Badge tone="danger">
              <ShieldAlert className="h-3 w-3" />
              подпись не сошлась
            </Badge>
          )}
        </>
      ) : (
        <span>Вебхуков от monobank ещё не было.</span>
      )}
    </div>
  );
}
