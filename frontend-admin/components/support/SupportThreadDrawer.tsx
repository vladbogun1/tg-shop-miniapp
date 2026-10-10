"use client";

/**
 * One support thread in a right drawer (full screen on a phone), like the order drawer:
 * customer (opens the profile drawer on top), source, status + «Закрыть» / «Открыть снова»,
 * the product card (admin editor + public page) and the chat.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Lock, PencilLine, RotateCcw, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { UserProfileDrawer } from "@/components/users/UserProfileDrawer";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, type UserCardDto } from "@/lib/api";
import { formatDateTime } from "@/lib/orders";
import { ordersApi } from "@/lib/orders-api";
import {
  refreshSupport,
  siteProductUrl,
  SUPPORT_KEY,
  supportApi,
  type SupportThread,
} from "@/lib/support-api";
import { useToast } from "@/lib/toast";
import { useBackToClose } from "@/lib/use-back-close";
import { SupportChat } from "./SupportChat";
import { customerOf, ProductThumb, ThreadSourceBadge, ThreadStatusBadges, threadTopic } from "./parts";

export function SupportThreadDrawer({
  threadId,
  initial,
  onClose,
}: {
  threadId: string | null;
  /** The row from the list — shown while the thread itself loads. */
  initial?: SupportThread;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<UserCardDto | null>(null);
  const close = useBackToClose(!!threadId, onClose, { marker: "supportDrawer" });

  const q = useQuery({
    queryKey: [...SUPPORT_KEY, "thread", threadId],
    queryFn: () => supportApi.thread(threadId!),
    enabled: !!threadId,
    placeholderData: initial && initial.id === threadId ? initial : undefined,
  });
  const thread = q.data;

  async function toggleStatus() {
    if (!thread) return;
    setBusy(true);
    try {
      const next = thread.status === "OPEN" ? await supportApi.close(thread.id) : await supportApi.reopen(thread.id);
      qc.setQueryData([...SUPPORT_KEY, "thread", thread.id], next);
      push(next.status === "CLOSED" ? "Вопрос закрыт" : "Вопрос открыт снова", "ok");
      refreshSupport(qc);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось изменить статус", "error");
    } finally {
      setBusy(false);
    }
  }

  async function openCustomer() {
    if (!thread?.userId) return;
    const tgId = thread.userId;
    try {
      const found = await ordersApi.findUser(tgId);
      setProfile(
        found ?? {
          telegramUserId: tgId,
          username: null,
          firstName: thread.customerName ?? null,
          premium: false,
          botBlocked: false,
          ordersCount: 0,
          totalSpentMinor: 0,
        }
      );
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось открыть профиль", "error");
    }
  }

  const header = thread ? (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="eyebrow !text-[10px]">Поддержка</div>
      {thread.userId ? (
        <button
          type="button"
          onClick={openCustomer}
          title="Открыть профиль клиента"
          className="focusable hit group inline-flex min-w-0 items-center gap-1.5 self-start rounded-[var(--r-sm)] text-left"
        >
          <UserRound className="h-4 w-4 shrink-0 text-[var(--text-faint)] group-hover:text-[var(--accent-hi)]" />
          <span className="font-display truncate text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)] underline-offset-4 group-hover:text-[var(--accent-hi)] group-hover:underline">
            {customerOf(thread)}
          </span>
        </button>
      ) : (
        <div className="font-display truncate text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
          {customerOf(thread)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <ThreadStatusBadges thread={thread} />
        <ThreadSourceBadge source={thread.source} />
      </div>
    </div>
  ) : (
    <Skeleton className="h-10 w-48" />
  );

  return (
    <>
      <Drawer open={!!threadId} onClose={close} header={header} width="max-w-[640px]" zClass="z-[120]">
        <div className="flex h-full min-h-0 flex-col">
          {thread && (
            <div className="shrink-0 border-b border-[var(--line)] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <ProductThumb thread={thread} className="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <div className="field-label !text-[10.5px]">{thread.productId ? "Вопрос о товаре" : "Общий вопрос"}</div>
                  <div className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--text)]">
                    {threadTopic(thread)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    {thread.productId && (
                      <Link
                        href={`/products?edit=${encodeURIComponent(thread.productId)}`}
                        className="focusable hit inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--r-sm)] text-[var(--text-muted)] hover:text-[var(--accent-hi)]"
                      >
                        <PencilLine className="h-3.5 w-3.5" />В админке
                      </Link>
                    )}
                    {thread.productSlug && (
                      <a
                        href={siteProductUrl(thread.productSlug)}
                        target="_blank"
                        rel="noreferrer"
                        className="focusable hit inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--r-sm)] text-[var(--text-muted)] hover:text-[var(--accent-hi)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        На сайте
                      </a>
                    )}
                    <span className="text-[var(--text-faint)]">с {formatDateTime(thread.createdAt)}</span>
                  </div>
                </div>
                <Button
                  variant={thread.status === "OPEN" ? "outline" : "surface"}
                  size="sm"
                  loading={busy}
                  className="shrink-0"
                  icon={thread.status === "OPEN" ? <Lock className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  onClick={toggleStatus}
                >
                  {thread.status === "OPEN" ? "Закрыть" : "Открыть снова"}
                </Button>
              </div>
            </div>
          )}

          {q.isError && !thread ? (
            <div className="p-5 text-[13px] text-[var(--danger-ink)]">
              {q.error instanceof ApiError ? q.error.message : "Не удалось загрузить вопрос"}
            </div>
          ) : (
            threadId && (
              <div className="flex min-h-0 flex-1 p-3 pb-[calc(12px+var(--safe-bottom))] sm:p-5 sm:pb-[calc(20px+var(--safe-bottom))]">
                <SupportChat key={threadId} threadId={threadId} closed={thread?.status === "CLOSED"} />
              </div>
            )
          )}
        </div>
      </Drawer>

      {/* The customer's profile opens OVER the thread (rendered later → on top). */}
      <UserProfileDrawer user={profile} onClose={() => setProfile(null)} />
    </>
  );
}
