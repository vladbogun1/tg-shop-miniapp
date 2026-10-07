"use client";

/**
 * «Поддержка» (route "/support"): customer questions that are not about an order — about a product
 * before buying it, or a general one.
 *
 *  - GET /api/admin/support/threads?filter=&q= — latest activity first, polled every 15 s.
 *  - A row opens the thread in a drawer (full screen on a phone), like orders do.
 *  - Deep link `/support?thread=<id>` — the Telegram notification, the push and «Внимание» open it.
 *    It is followed while on the page too (a push tapped with the page already open) and removed
 *    from the address right after opening.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { LifeBuoy, RotateCw, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { customerOf, ProductThumb, ThreadSourceBadge, ThreadStatusBadges, threadTopic } from "@/components/support/parts";
import { SupportThreadDrawer } from "@/components/support/SupportThreadDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl, type SegOption } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/orders";
import {
  SUPPORT_KEY,
  supportApi,
  useSupportUnread,
  type SupportFilter,
  type SupportThread,
} from "@/lib/support-api";
import { useDebounced } from "@/lib/use-debounced";

const EMPTY_HINT: Record<SupportFilter, string> = {
  awaiting: "Все вопросы отвечены.",
  open: "Открытых вопросов нет. Новые появятся здесь сами.",
  closed: "Закрытых вопросов пока нет.",
  all: "Покупатели ещё ничего не спрашивали.",
};

export default function SupportPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <SupportScreen />
    </Suspense>
  );
}

function SupportScreen() {
  const params = useSearchParams();
  const deepId = params.get("thread");
  const [openId, setOpenId] = useState<string | null>(null);

  const [filter, setFilter] = useState<SupportFilter>("open");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 350);

  const list = useQuery({
    queryKey: [...SUPPORT_KEY, "threads", filter, q],
    queryFn: () => supportApi.threads({ filter, q: q || undefined, limit: 200 }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
  const { data: unread } = useSupportUnread();
  const awaiting = unread?.count ?? 0;
  const threads = list.data ?? [];

  const options: SegOption<SupportFilter>[] = [
    { value: "awaiting", label: "Ждут ответа", count: awaiting > 0 ? awaiting : undefined },
    { value: "open", label: "Открытые" },
    { value: "closed", label: "Закрытые" },
    { value: "all", label: "Все" },
  ];

  // Deep link: open the thread, then drop the parameter (a reload does not reopen it, and the
  // drawer's own «Назад» entry stays the only history change).
  useEffect(() => {
    if (!deepId) return;
    setOpenId(deepId);
    const sp = new URLSearchParams(window.location.search);
    sp.delete("thread");
    const qs = sp.toString();
    window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [deepId]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Поддержка"
        subtitle="Вопросы покупателей о товарах и общие вопросы. Обновляется каждые 15 секунд."
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />}
            onClick={() => list.refetch()}
          >
            Обновить
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SegmentedControl options={options} value={filter} onChange={setFilter} />
        <div className="lg:ml-auto lg:w-80">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Клиент, товар или текст"
            aria-label="Поиск по вопросам"
            icon={<Search className="h-4 w-4" />}
            rightSlot={
              search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Очистить поиск"
                  className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : undefined
            }
          />
        </div>
      </div>

      <QueryState
        isLoading={list.isLoading}
        isError={list.isError && !list.data}
        error={list.error}
        refetch={list.refetch}
        loadingLabel="Загружаем вопросы"
      >
        {threads.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title={q ? "Ничего не нашлось" : "Вопросов нет"}
            description={q ? "Попробуйте другое имя, товар или слово из сообщения." : EMPTY_HINT[filter]}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {threads.map((t, i) => (
              <ThreadRow key={t.id} thread={t} index={i} active={t.id === openId} onOpen={() => setOpenId(t.id)} />
            ))}
          </ul>
        )}
      </QueryState>

      <SupportThreadDrawer
        threadId={openId}
        initial={threads.find((t) => t.id === openId)}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function ThreadRow({
  thread,
  index,
  active,
  onOpen,
}: {
  thread: SupportThread;
  index: number;
  active: boolean;
  onOpen: () => void;
}) {
  const waiting = thread.status === "OPEN" && !!thread.awaitingSince;
  const lastByAdmin = thread.lastSender === "ADMIN";
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.025, ease: [0.22, 1, 0.36, 1] }}
      className="list-none"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "card card-hover focusable flex w-full items-start gap-3 p-3 text-left lg:items-center lg:gap-4 lg:p-3.5",
          waiting && "shadow-[inset_2px_0_0_var(--accent),var(--shadow-1)]",
          active && "border-[rgba(255,102,0,.45)]",
          thread.status === "CLOSED" && "opacity-80"
        )}
      >
        <ProductThumb thread={thread} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-[var(--text)]">{customerOf(thread)}</span>
            {thread.unreadCount > 0 && (
              <span className="count-badge shrink-0" title="Непрочитанные сообщения">
                {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
              </span>
            )}
            <span className="tabular ml-auto shrink-0 text-[12px] text-[var(--text-faint)]">
              {timeAgo(thread.lastMessageAt)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{threadTopic(thread)}</div>
          {thread.lastPreview && (
            <div
              className={cn(
                "mt-0.5 line-clamp-1 break-words text-[13px]",
                thread.unreadCount > 0 ? "text-[var(--text)]" : "text-[var(--text-faint)]"
              )}
            >
              {lastByAdmin && <span className="text-[var(--text-faint)]">Вы: </span>}
              {thread.lastPreview}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ThreadStatusBadges thread={thread} />
            <ThreadSourceBadge source={thread.source} />
          </div>
        </div>
      </button>
    </motion.li>
  );
}
