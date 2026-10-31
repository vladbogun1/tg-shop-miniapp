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
import { LifeBuoy, RotateCw, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@shop/ui/admin-button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl, type SegOption } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/use-debounced";
import { awaitingCount, EMPTY_HINT, searchWithoutThread } from "../model/thread";
import type { SupportFilter } from "../model/types";
import { useSupportThreads, useSupportUnread } from "../queries";
import { SupportThreadDrawer } from "./SupportThreadDrawer";
import { ThreadRow } from "./ThreadRow";

export function SupportScreen() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <SupportContent />
    </Suspense>
  );
}

function SupportContent() {
  const params = useSearchParams();
  const deepId = params.get("thread");
  const [openId, setOpenId] = useState<string | null>(null);

  const [filter, setFilter] = useState<SupportFilter>("open");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 350);

  const list = useSupportThreads(filter, q);
  const { data: unread } = useSupportUnread();
  const threads = list.data ?? [];

  const options: SegOption<SupportFilter>[] = [
    { value: "awaiting", label: "Ждут ответа", count: awaitingCount(unread) },
    { value: "open", label: "Открытые" },
    { value: "closed", label: "Закрытые" },
    { value: "all", label: "Все" },
  ];

  // Deep link: open the thread, then drop the parameter (a reload does not reopen it, and the
  // drawer's own «Назад» entry stays the only history change).
  useEffect(() => {
    if (!deepId) return;
    setOpenId(deepId);
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + searchWithoutThread(window.location.search)
    );
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
            placeholder="Клиент или товар"
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
            description={q ? "Ищется по имени клиента и названию товара — попробуйте другое." : EMPTY_HINT[filter]}
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
