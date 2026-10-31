"use client";

/**
 * /account/support/[id] — one support thread: topic card (product or general question), status,
 * «Close», and the chat (SupportChat).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useConfirm } from "@shop/ui/confirm";
import { type SupportThread } from "@shop/core/support";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { ApiError } from "@/lib/api";
import { SUPPORT_KEYS, supportApi, supportErrorText } from "../queries";
import { SupportChat } from "./SupportChat";
import { SupportStatusChip, SupportTopicCard, threadTitle } from "./parts";

export function SupportThreadView({ id }: { id: string }) {
  const { t, href } = useI18n();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const thread = useQuery({
    queryKey: SUPPORT_KEYS.thread(id),
    queryFn: () => supportApi.thread(id),
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 400)) && n < 2,
  });
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const setThread = useCallback(
    (th: SupportThread) => {
      qc.setQueryData(SUPPORT_KEYS.thread(id), th);
      void qc.invalidateQueries({ queryKey: SUPPORT_KEYS.threads });
    },
    [qc, id]
  );

  async function onClose() {
    if (closing) return;
    const ok = await confirm({ title: t("support.close"), message: t("support.closeConfirm"), confirmLabel: t("support.close"), cancelLabel: t("common.cancel") });
    if (!ok) return;
    setClosing(true);
    setCloseError(null);
    try {
      setThread(await supportApi.close(id));
    } catch (e) {
      setCloseError(supportErrorText(e, t));
    } finally {
      setClosing(false);
    }
  }

  const back = (
    <Link
      href={href("/account/support")}
      className="inline-flex min-h-11 items-center gap-2 self-start font-display text-[13px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
      {t("support.back")}
    </Link>
  );

  if (thread.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <div className="shimmer h-20" />
        <div className="shimmer h-[420px]" />
      </div>
    );
  }
  if (thread.isError || !thread.data) {
    const notFound = thread.error instanceof ApiError && (thread.error.status === 404 || thread.error.status === 400);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <div className="nb flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-[var(--danger)]">
            {notFound ? t("support.error.notFound") : t("support.error.load")}
          </p>
          {!notFound && (
            <Button variant="accent" size="sm" onClick={() => void thread.refetch()}>
              {t("common.retry")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const th = thread.data;
  const isProduct = !!th.productId;
  const closed = th.status === "CLOSED";

  return (
    <div className="flex flex-col gap-4">
      {back}
      <SupportTopicCard
        eyebrow={isProduct ? t("support.product") : t("support.general")}
        title={threadTitle(th, t)}
        imageUrl={th.productImageUrl}
        productPath={isProduct ? `/product/${th.productSlug ?? th.productId}` : null}
      >
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <SupportStatusChip status={th.status} />
          {!closed && th.awaitingSince && (
            <span className="text-[12px] font-medium text-[var(--faint)]">{t("support.awaiting")}</span>
          )}
        </div>
      </SupportTopicCard>

      {!closed && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="surface" loading={closing} onClick={() => void onClose()} icon={<Lock className="h-4 w-4" strokeWidth={2.25} />}>
            {t("support.close")}
          </Button>
          {closeError && <p className="text-[13px] font-semibold text-[var(--danger)]">{closeError}</p>}
        </div>
      )}

      <SupportChat
        threadId={id}
        closed={closed}
        onThreadChanged={() => void qc.invalidateQueries({ queryKey: SUPPORT_KEYS.thread(id) })}
      />
    </div>
  );
}

