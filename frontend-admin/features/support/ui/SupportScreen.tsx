"use client";

/**
 * «Поддержка» (route "/support"): вопросы покупателей, не связанные с заказом — о товаре до покупки или общие.
 *
 *  - GET /api/admin/support/threads?filter=&q= — свежая активность сверху, опрос раз в 15 с.
 *  - ПК (>= 1024): мастер-деталь — очередь слева, вопрос справа. Первый вопрос сам НЕ открывается: открытие
 *    помечает сообщения прочитанными, а оператор их не видел. Alt+↓ / Alt+↑ — соседний вопрос.
 *  - Телефон/планшет: строка открывает вопрос в шторке во весь экран.
 *  - Поиск с непустой строкой идёт по всем статусам («Все»), иначе по выбранному сегменту.
 *  - Ссылка `/support?thread=<id>` — уведомление в Telegram, push и «Внимание» открывают вопрос, в том числе
 *    когда страница уже открыта; параметр сразу убирается из адреса.
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { SegOption } from "@/components/ui/SegmentedControl";
import { useDebounced } from "@/lib/use-debounced";
import { useFillHeight } from "@/lib/use-fill-height";
import { useIsDesktop } from "@/lib/use-media";
import { awaitingCount, neighbourThreadId, searchWithoutThread, sortForFilter } from "../model/thread";
import type { SupportFilter } from "../model/types";
import { useSupportThreads, useSupportUnread } from "../queries";
import { StartThreadModal } from "./StartThreadModal";
import { SupportList } from "./SupportList";
import { SupportThreadDrawer } from "./SupportThreadDrawer";
import { ThreadPane } from "./ThreadPane";
import { useNowMs } from "./use-now";

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
  const desktop = useIsDesktop();
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const [filter, setFilter] = useState<SupportFilter>("open");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 350);
  const effectiveFilter: SupportFilter = q ? "all" : filter;

  const list = useSupportThreads(effectiveFilter, q);
  const { data: unread } = useSupportUnread();
  const nowMs = useNowMs();
  const threads = useMemo(() => sortForFilter(list.data ?? [], effectiveFilter), [list.data, effectiveFilter]);

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
    window.history.replaceState(window.history.state, "", window.location.pathname + searchWithoutThread(window.location.search));
  }, [deepId]);

  // Alt+↓ / Alt+↑ — следующий / предыдущий вопрос очереди (только мастер-деталь).
  const idsRef = useRef<string[]>([]);
  const openRef = useRef<string | null>(null);
  idsRef.current = threads.map((t) => t.id);
  openRef.current = openId;
  useEffect(() => {
    if (!desktop) return;
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      const next = neighbourThreadId(idsRef.current, openRef.current, e.key === "ArrowDown" ? 1 : -1);
      if (!next) return;
      e.preventDefault();
      setOpenId(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop]);

  const gridRef = useRef<HTMLDivElement>(null);
  useFillHeight(gridRef, desktop);
  const initial = threads.find((t) => t.id === openId);

  const listProps = {
    list,
    threads,
    options,
    filter: effectiveFilter,
    onFilter: (f: SupportFilter) => {
      setSearch("");
      setFilter(f);
    },
    search,
    onSearch: setSearch,
    q,
    openId,
    nowMs,
    onOpen: setOpenId,
    onCompose: () => setComposing(true),
  };

  return (
    <div className="min-w-0">
      <PageHeader title="Поддержка" subtitle="Вопросы покупателей о товарах и общие вопросы. Обновляется каждые 15 секунд." />

      {desktop ? (
        <div ref={gridRef} className="grid min-h-0 grid-cols-[minmax(320px,380px)_minmax(0,1fr)] gap-4">
          <SupportList {...listProps} scrollClass="thin-scroll overflow-y-auto pr-1" />
          <ThreadPane threadId={openId} initial={initial} />
        </div>
      ) : (
        <>
          <SupportList {...listProps} />
          <SupportThreadDrawer threadId={openId} initial={initial} onClose={() => setOpenId(null)} />
        </>
      )}

      <StartThreadModal
        open={composing}
        onClose={() => setComposing(false)}
        onStarted={(t) => {
          setComposing(false);
          setOpenId(t.id);
        }}
      />
    </div>
  );
}
