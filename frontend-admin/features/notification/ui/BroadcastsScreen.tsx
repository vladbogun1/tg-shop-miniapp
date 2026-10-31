"use client";

/**
 * Рассылки — compose an HTML-formatted Telegram broadcast, test it, send it to an audience, and see
 * past broadcasts with their results (R9).
 *
 *  - Text: the main version + optional uk / ru / en versions; each customer gets the version of
 *    their language (users.locale → Telegram language → uk), else the main text.
 *  - Audience: all / with orders / without / premium, optionally narrowed to one language.
 *  - Draft (texts, audience, button) survives leaving the page (localStorage).
 *  - Character counter against Telegram's 4096 limit; HTML is validated before anything is sent.
 *  - Test: «себе» (the signed-in admin) or any user picked by name / id.
 *  - History: GET /api/admin/broadcast/history (table `broadcasts`).
 */
import { toast } from "@shop/ui/toast";
import { motion } from "framer-motion";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { staggerContainer } from "@/lib/motion";
import { startBody } from "../model/compose";
import {
  useBroadcastAudiences,
  useBroadcastHistory,
  useBroadcastStatus,
  useRefreshHistoryWhenDone,
  useStartBroadcast,
} from "../queries";
import { ComposeCard } from "./ComposeCard";
import { ConfirmModal } from "./ConfirmModal";
import { HistoryCard } from "./HistoryCard";
import { PreviewCard } from "./PreviewCard";
import { TG_PREVIEW_CSS } from "./preview-css";
import { SendCard } from "./SendCard";
import { TestCard } from "./TestCard";
import { useCompose } from "./use-compose";

export function BroadcastsScreen() {
  const c = useCompose();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: audiences } = useBroadcastAudiences(c.values.lang);
  const { data: status } = useBroadcastStatus();
  const historyQ = useBroadcastHistory(status?.running ?? false);
  useRefreshHistoryWhenDone(status);
  const startM = useStartBroadcast(c.resetTexts);
  const audienceCount = audiences?.[c.values.audience] ?? 0;

  function requestBroadcast() {
    if (!c.texts.main.trim()) return toast.error("Основной текст обязателен — он уходит тем, для кого нет версии");
    if (c.problems.length) return toast.error(c.problems[0]);
    setConfirmOpen(true);
  }

  function startBroadcast() {
    setConfirmOpen(false);
    startM.mutate(startBody(c.values));
  }

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex min-w-0 flex-col">
      <style>{TG_PREVIEW_CSS}</style>

      <PageHeader
        title="Рассылки"
        subtitle="Соберите сообщение, проверьте предпросмотр, отправьте тест и разошлите аудитории."
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <ComposeCard c={c} />
        <PreviewCard c={c} />
      </div>

      <TestCard c={c} />
      <SendCard c={c} audiences={audiences} status={status} starting={startM.isPending} onRequest={requestBroadcast} />
      <HistoryCard q={historyQ} onReuse={c.reuse} />

      <ConfirmModal
        open={confirmOpen}
        audience={c.values.audience}
        lang={c.values.lang}
        count={audienceCount}
        versions={c.versions}
        starting={startM.isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={startBroadcast}
      />
    </motion.div>
  );
}
