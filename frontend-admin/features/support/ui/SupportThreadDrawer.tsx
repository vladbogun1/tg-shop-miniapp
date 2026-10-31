"use client";

/**
 * One support thread in a right drawer (full screen on a phone), like the order drawer:
 * customer (opens the profile drawer on top), source, status + «Закрыть» / «Открыть снова»,
 * the product card (admin editor + public page) and the chat.
 */
import { UserRound } from "lucide-react";
import { useState } from "react";
import { UserProfileDrawer, customerApi, type UserCardDto } from "@/features/customer";
import { Drawer, useBackToClose } from "@shop/ui/overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";
import { toast } from "@shop/ui/toast";
import { customerOf } from "../model/thread";
import type { SupportThread } from "../model/types";
import { useSupportThread, useToggleThreadStatus } from "../queries";
import { SupportChat } from "./chat/SupportChat";
import { ThreadSourceBadge, ThreadStatusBadges } from "./parts";
import { ThreadProductBar } from "./ThreadProductBar";

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
  const [profile, setProfile] = useState<UserCardDto | null>(null);
  const close = useBackToClose(!!threadId, onClose, { marker: "supportDrawer" });

  const q = useSupportThread(threadId, initial);
  const toggle = useToggleThreadStatus();
  const thread = q.data;

  async function openCustomer() {
    if (!thread?.userId) return;
    const tgId = thread.userId;
    try {
      const found = await customerApi.findUser(tgId);
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
      toast.error(e instanceof ApiError ? e.message : "Не удалось открыть профиль");
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
          {thread && <ThreadProductBar thread={thread} busy={toggle.isPending} onToggle={() => toggle.mutate(thread)} />}

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
