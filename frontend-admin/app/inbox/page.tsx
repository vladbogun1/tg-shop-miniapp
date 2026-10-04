"use client";

/**
 * «Внимание» (route "/inbox"): one screen with everything waiting for the owner, most urgent
 * group first — payment claims → unread chats → new orders nobody approved → approved but not
 * shipped → refusals/returns → stock running out → a failed site rebuild.
 *
 *  - GET /api/admin/inbox, polled every 30 s and on focus; the order drawer and the chat refetch
 *    it after every action (there is no global order WebSocket topic to listen to).
 *  - An order opens in the OrderDrawer ON TOP of this page (payment rows straight into the
 *    payment dialog, chat rows into the chat), so the list stays where it was.
 *  - «Отложить» (1 h / until 9:00 / 3 days) and «Разобрано» are optimistic, with «Отменить»
 *    in the toast. A newer event (another claim, a new message) brings a row back by itself.
 */
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCheck,
  Globe,
  Hourglass,
  MessageCircle,
  PackageMinus,
  RotateCw,
  Truck,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { InboxRow } from "@/components/inbox/InboxRow";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { adminApi, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  INBOX_QUERY_KEY,
  inboxApi,
  SNOOZE_OPTIONS,
  useInbox,
  type Inbox,
  type InboxGroup,
  type InboxItem,
  type InboxType,
  type SnoozePreset,
} from "@/lib/inbox";
import { useToast } from "@/lib/toast";
import { useIsDesktop } from "@/lib/use-media";

const GROUP_ICON: Record<InboxType, LucideIcon> = {
  PAYMENT: Wallet,
  CHAT: MessageCircle,
  NEW_STALE: Hourglass,
  APPROVED_STALE: Truck,
  RETURN: Undo2,
  LOW_STOCK: PackageMinus,
  SITE_ERROR: Globe,
};

/** Icon tile colour per group: money and people first, information last. */
const GROUP_TONE: Record<InboxType, string> = {
  PAYMENT: "bg-[var(--ok)]",
  CHAT: "bg-[var(--accent)]",
  NEW_STALE: "bg-[var(--st-new)]",
  APPROVED_STALE: "bg-[var(--st-approved)]",
  RETURN: "bg-[var(--st-rejected)]",
  LOW_STOCK: "bg-[var(--c3)]",
  SITE_ERROR: "bg-[var(--surface-3)]",
};

/** Rows shown per group before «Показать ещё». */
const COLLAPSED = 5;

interface OpenOrder {
  id: string;
  tab: "details" | "chat";
  payment: boolean;
}

/** The inbox without one row (optimistic snooze / dismiss). */
function withoutItem(inbox: Inbox, item: InboxItem, snoozed: boolean): Inbox {
  let removed = 0;
  const groups = inbox.groups.map((g) => {
    if (g.id !== item.type) return g;
    const items = g.items.filter((it) => it.key !== item.key);
    removed = g.items.length - items.length;
    return { ...g, items, count: items.length, snoozed: g.snoozed + (snoozed ? removed : 0) };
  });
  return { ...inbox, groups, total: Math.max(0, inbox.total - removed) };
}

function untilLabel(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `до ${time}` : `до ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${time}`;
}

export default function InboxPage() {
  const q = useInbox();
  const qc = useQueryClient();
  const router = useRouter();
  const { push } = useToast();
  const isDesktop = useIsDesktop();
  const [order, setOrder] = useState<OpenOrder | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [readAllBusy, setReadAllBusy] = useState(false);

  const refetch = () => qc.invalidateQueries({ queryKey: INBOX_QUERY_KEY });

  const data = q.data;
  const groups = (data?.groups ?? []).filter((g) => g.items.length > 0);
  const snoozedTotal = (data?.groups ?? []).reduce((n, g) => n + g.snoozed, 0);

  async function restore(item: InboxItem) {
    try {
      await inboxApi.restore(item);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось вернуть", "error");
    }
    refetch();
  }

  async function snooze(item: InboxItem, preset: SnoozePreset) {
    await qc.cancelQueries({ queryKey: INBOX_QUERY_KEY });
    const before = qc.getQueryData<Inbox>(INBOX_QUERY_KEY);
    if (before) qc.setQueryData(INBOX_QUERY_KEY, withoutItem(before, item, true));
    try {
      const res = await inboxApi.snooze(item, preset);
      const label = res?.until ? untilLabel(res.until) : SNOOZE_OPTIONS.find((o) => o.value === preset)?.label;
      push(`Отложено ${label ?? ""}`.trim(), "ok", { label: "Отменить", onClick: () => void restore(item) });
    } catch (e) {
      if (before) qc.setQueryData(INBOX_QUERY_KEY, before);
      push(e instanceof ApiError ? e.message : "Не удалось отложить", "error");
    }
    refetch();
  }

  async function dismiss(item: InboxItem) {
    await qc.cancelQueries({ queryKey: INBOX_QUERY_KEY });
    const before = qc.getQueryData<Inbox>(INBOX_QUERY_KEY);
    if (before) qc.setQueryData(INBOX_QUERY_KEY, withoutItem(before, item, false));
    try {
      await inboxApi.dismiss(item);
      push("Разобрано", "ok", { label: "Отменить", onClick: () => void restore(item) });
    } catch (e) {
      if (before) qc.setQueryData(INBOX_QUERY_KEY, before);
      push(e instanceof ApiError ? e.message : "Не удалось отметить", "error");
    }
    refetch();
  }

  async function retrySite() {
    setSiteBusy(true);
    try {
      const res = await adminApi.siteRevalidate();
      if (res.ok) push("Сайт обновлён", "ok");
      else push(`Сайт снова не обновился: ${res.error ?? "ошибка"}`, "error");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось обновить сайт", "error");
    } finally {
      setSiteBusy(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["site-revalidate-status"] });
    }
  }

  async function readAllChats() {
    setReadAllBusy(true);
    try {
      const res = await adminApi.markAllRead();
      push(`Отмечено прочитанными: ${res?.marked ?? 0}`, "ok");
      qc.invalidateQueries({ queryKey: ["board"] });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось отметить", "error");
    } finally {
      setReadAllBusy(false);
      refetch();
    }
  }

  function primary(item: InboxItem) {
    switch (item.type) {
      case "PAYMENT":
        if (item.orderId) setOrder({ id: item.orderId, tab: "details", payment: true });
        break;
      case "CHAT":
        if (item.orderId) setOrder({ id: item.orderId, tab: "chat", payment: false });
        break;
      case "LOW_STOCK":
        if (item.productId) router.push(`/products?edit=${item.productId}`);
        break;
      case "SITE_ERROR":
        void retrySite();
        break;
      default:
        if (item.orderId) setOrder({ id: item.orderId, tab: "details", payment: false });
    }
  }

  function groupAction(g: InboxGroup) {
    if (g.id === "CHAT" && g.items.length > 1) {
      return (
        <Button
          variant="ghost"
          size="sm"
          loading={readAllBusy}
          icon={<CheckCheck className="h-4 w-4" />}
          onClick={readAllChats}
        >
          Прочитать всё
        </Button>
      );
    }
    if (g.id === "LOW_STOCK") {
      return (
        <Link
          href="/metrics?tab=stock"
          className="focusable inline-flex h-9 items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          Что дозаказать <ArrowRight className="h-4 w-4" />
        </Link>
      );
    }
    if (g.id === "SITE_ERROR") {
      return (
        <Link
          href="/settings#site"
          className="focusable inline-flex h-9 items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          Настройки → Сайт <ArrowRight className="h-4 w-4" />
        </Link>
      );
    }
    return null;
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Внимание"
        subtitle="Всё, что ждёт вашего действия. Обновляется само каждые 30 секунд."
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />}
            onClick={() => q.refetch()}
          >
            Обновить
          </Button>
        }
      />

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError && !data}
        error={q.error}
        refetch={q.refetch}
        loadingLabel="Собираем, что требует внимания"
      >
        {groups.length === 0 ? (
          <EmptyState
            icon={CheckCheck}
            title="Всё разобрано ✓"
            description={
              snoozedTotal > 0
                ? `Отложено: ${snoozedTotal}. Они вернутся сами, когда подойдёт срок.`
                : "Новые заявки об оплате, сообщения и застрявшие заказы появятся здесь."
            }
          />
        ) : (
          <>
            {/* Jump list — on a phone the groups are a long scroll. */}
            <nav
              aria-label="Группы"
              className="thin-scroll -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-wrap lg:px-0"
            >
              {groups.map((g) => {
                const Icon = GROUP_ICON[g.id];
                return (
                  <a
                    key={g.id}
                    href={`#inbox-${g.id}`}
                    className="nb-press focusable inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-bold uppercase tracking-wide text-[var(--text)] shadow-[3px_3px_0_var(--shadow)]"
                  >
                    <Icon className="h-4 w-4" />
                    {g.title}
                    <span className="rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--accent)] px-1.5 text-[11px] font-black text-[var(--accent-ink)]">
                      {g.count}
                    </span>
                  </a>
                );
              })}
            </nav>

            <div className="flex flex-col gap-6">
              {groups.map((g, i) => (
                <GroupSection
                  key={g.id}
                  group={g}
                  index={i}
                  action={groupAction(g)}
                  isDesktop={isDesktop}
                  siteBusy={siteBusy}
                  onPrimary={primary}
                  onSnooze={snooze}
                  onDismiss={dismiss}
                />
              ))}
            </div>

            {snoozedTotal > 0 && (
              <p className="mt-6 text-center text-[12px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
                Отложено: {snoozedTotal} — вернутся сами
              </p>
            )}
          </>
        )}
      </QueryState>

      <OrderDrawer
        orderId={order?.id ?? null}
        initialTab={order?.tab ?? "details"}
        initialAction={order?.payment ? "payment" : undefined}
        onClose={() => {
          setOrder(null);
          refetch();
        }}
      />
    </div>
  );
}

function GroupSection({
  group,
  index,
  action,
  isDesktop,
  siteBusy,
  onPrimary,
  onSnooze,
  onDismiss,
}: {
  group: InboxGroup;
  index: number;
  action: ReactNode;
  isDesktop: boolean;
  siteBusy: boolean;
  onPrimary: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, preset: SnoozePreset) => void;
  onDismiss: (item: InboxItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = GROUP_ICON[group.id];
  const shown = expanded ? group.items : group.items.slice(0, COLLAPSED);
  const hidden = group.items.length - shown.length;

  return (
    <motion.section
      id={`inbox-${group.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: Math.min(index, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="scroll-mt-[88px]"
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] border-[3px] border-[var(--line)] text-[var(--accent-ink)] shadow-[3px_3px_0_var(--shadow)]",
            GROUP_TONE[group.id]
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[16px] font-black uppercase tracking-wide text-[var(--text)]">
            {group.title}
            <span className="rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface)] px-1.5 text-[12px] font-black">
              {group.count}
            </span>
          </h2>
          <p className="text-[12px] leading-snug text-[var(--text-muted)]">
            {group.hint}
            {group.snoozed > 0 && <span className="text-[var(--text-faint)]"> · отложено: {group.snoozed}</span>}
          </p>
        </div>
        {action && <div className="w-full pl-12 sm:w-auto sm:pl-0">{action}</div>}
      </header>

      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {shown.map((item) => (
            <InboxRow
              key={item.key}
              item={item}
              dismissible={group.dismissible}
              isDesktop={isDesktop}
              busy={item.type === "SITE_ERROR" && siteBusy}
              onPrimary={onPrimary}
              onSnooze={onSnooze}
              onDismiss={onDismiss}
            />
          ))}
        </AnimatePresence>
      </ul>

      {(hidden > 0 || expanded) && group.items.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="focusable mt-3 h-11 w-full rounded-[var(--r-md)] border-[3px] border-dashed border-[var(--line)] text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          {expanded ? "Свернуть" : `Показать ещё ${hidden}`}
        </button>
      )}
    </motion.section>
  );
}
