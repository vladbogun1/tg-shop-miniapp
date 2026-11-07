"use client";

/**
 * Рассылки — compose an HTML-formatted Telegram broadcast, test it, send it to an audience, and see
 * past broadcasts with their results (R9).
 *
 *  - Text: the main version + optional uk / ru / en versions; each customer gets the version of
 *    their language (users.locale → Telegram language → uk), else the main text.
 *  - Audience: all / with orders / without / premium, optionally narrowed to one language.
 *  - ПК: две колонки — слева сообщение, кому и тест, справа липкий предпросмотр; история ниже.
 *    Телефон: сегменты «Сообщение / Кому / История» и нижняя панель (предпросмотр, «Разослать (N)»).
 *  - Draft (texts, audience, button) survives leaving the page (localStorage).
 *  - Counter against Telegram's limit; HTML is validated, «Разослать» is blocked with a stated reason.
 *  - Test: «себе» (the signed-in admin) or any user picked by name / id.
 *  - History: GET /api/admin/broadcast/history (table `broadcasts`).
 */
import { toast } from "@shop/ui/toast";
import { Button } from "@shop/ui/admin-button";
import { Drawer, useBackToClose } from "@shop/ui/overlay";
import { motion } from "framer-motion";
import { Eye } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useIsDesktop } from "@/lib/use-media";
import { staggerContainer } from "@/lib/motion";
import { blockReason, startBody } from "../model/compose";
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
import { PreviewBubble, PreviewCard, versionLabel } from "./PreviewCard";
import { TG_PREVIEW_CSS } from "./preview-css";
import { SendButton } from "./SendButton";
import { SendCard } from "./SendCard";
import { TestCard } from "./TestCard";
import { useCompose } from "./use-compose";

type MobileTab = "compose" | "audience" | "history";
const MOBILE_TABS = [
  { value: "compose" as const, label: "Сообщение" },
  { value: "audience" as const, label: "Кому" },
  { value: "history" as const, label: "История" },
];

export function BroadcastsScreen() {
  const c = useCompose();
  const desktop = useIsDesktop();
  const [tab, setTab] = useState<MobileTab>("compose");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const closePreview = useBackToClose(previewOpen, () => setPreviewOpen(false), { marker: "broadcastPreview" });
  const { data: audiences } = useBroadcastAudiences(c.values.lang);
  const { data: status } = useBroadcastStatus();
  const historyQ = useBroadcastHistory(status?.running ?? false);
  useRefreshHistoryWhenDone(status);
  const startM = useStartBroadcast(c.resetTexts);
  const audienceCount = audiences?.[c.values.audience] ?? 0;
  const running = status?.running ?? false;
  const reason = blockReason({ texts: c.texts, audienceCount, running });

  function requestBroadcast() {
    if (reason) return toast.error(reason);
    setConfirmOpen(true);
  }

  function startBroadcast() {
    setConfirmOpen(false);
    startM.mutate(startBody(c.values, c.photo?.photoId));
  }

  const send = (
    <SendCard c={c} audiences={audiences} status={status} starting={startM.isPending} count={audienceCount} reason={reason} showSend={desktop} onRequest={requestBroadcast} />
  );
  const history = <HistoryCard q={historyQ} onReuse={(h) => (c.reuse(h), setTab("compose"))} />;

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex min-w-0 flex-col pb-24 lg:pb-0">
      <style>{TG_PREVIEW_CSS}</style>

      <PageHeader
        title="Рассылки"
        subtitle="Соберите сообщение, проверьте предпросмотр, отправьте тест и разошлите аудитории."
      />

      {desktop ? (
        <>
          <div className="grid min-w-0 grid-cols-2 items-start gap-4">
            <div className="flex min-w-0 flex-col gap-4">
              <ComposeCard c={c} />
              {send}
              <TestCard c={c} />
            </div>
            <PreviewCard c={c} sticky />
          </div>
          <div className="mt-4">{history}</div>
        </>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <SegmentedControl<MobileTab> options={MOBILE_TABS} value={tab} onChange={setTab} />
          {tab === "compose" && <ComposeCard c={c} />}
          {tab === "audience" && (
            <>
              {send}
              <TestCard c={c} />
            </>
          )}
          {tab === "history" && history}

          {/* Above the tab bar (it is fixed at the bottom too and wins by z-index); the safe area is its job. */}
          <div className="fixed inset-x-0 bottom-[var(--bottom-nav)] z-30 flex items-center gap-2 border-t border-[var(--line)] bg-[var(--bg)] px-4 py-3">
            <Button variant="surface" aria-label="Предпросмотр" icon={<Eye className="h-4 w-4" />} onClick={() => setPreviewOpen(true)} />
            <div className="min-w-0 flex-1">
              <SendButton className="w-full" count={audienceCount} reason={reason} running={running} starting={startM.isPending} onClick={requestBroadcast} />
              {reason && <p className="mt-1 truncate text-center text-[11px] text-[var(--text-muted)]">{reason}</p>}
            </div>
          </div>
          <Drawer open={previewOpen} onClose={closePreview} header={<span className="section-title">Предпросмотр · {versionLabel(c)}</span>} width="max-w-[480px]" zClass="z-[120]">
            <div className="p-4">
              <PreviewBubble c={c} />
            </div>
          </Drawer>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        audience={c.values.audience}
        lang={c.values.lang}
        count={audienceCount}
        versions={c.versions}
        starting={startM.isPending}
        preview={<PreviewBubble c={c} compact />}
        onClose={() => setConfirmOpen(false)}
        onConfirm={startBroadcast}
      />
    </motion.div>
  );
}
