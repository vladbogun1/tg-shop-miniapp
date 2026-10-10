"use client";

/**
 * «Журнал → Бот и сайт» — what the bot sent and to whom (delivered or not, and why), what customers
 * did on the website and in the Mini App, payments (monobank) and background jobs.
 *
 *  - «Лента»: every event, newest first, 50 per page; filters by source, event, result, whom the bot
 *    wrote to, failure reason, order, customer / text, period. A row opens its details: the reason
 *    in plain words, the raw Telegram / bank error, the event's fields, links to the order and the
 *    customer, «все события покупателя».
 *  - «Рассылки»: each broadcast with delivered / not delivered and the reasons; «Получатели» lists
 *    every recipient with the outcome.
 * Data: GET /api/admin/activity (+ /facets, /stats, /broadcasts) — activity_log, V47.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  ChevronDown,
  CreditCard,
  ExternalLink,
  Globe,
  Megaphone,
  RotateCcw,
  Search,
  Smartphone,
  Cog,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  activityApi,
  customerLabel,
  detailPairs,
  errorLabel,
  RECIPIENT_LABEL,
  resultLabel,
  SOURCE_ORDER,
  sourceLabel,
  typeLabel,
  UNREACHABLE,
  type ActivityFilter,
  type ActivityRow,
  type BroadcastSummary,
} from "@/lib/activity";
import { ApiError, type UserCardDto } from "@/lib/api";
import { ordersApi } from "@/lib/orders-api";
import { formatDateTime } from "@/lib/orders";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { useDebounced } from "@/lib/use-debounced";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { UserProfileDrawer } from "@/components/users/UserProfileDrawer";
import { OrderDrawer } from "@/components/orders/OrderDrawer";

const PAGE = 50;

const SOURCE_ICON: Record<string, LucideIcon> = {
  BOT: Bot,
  SITE: Globe,
  MINIAPP: Smartphone,
  PAYMENT: CreditCard,
  SYSTEM: Cog,
};

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";
const SOURCE_TONE: Record<string, Tone> = {
  BOT: "accent",
  SITE: "info",
  MINIAPP: "info",
  PAYMENT: "ok",
  SYSTEM: "neutral",
};

function resultTone(result: string): Tone {
  if (result === "OK") return "ok";
  if (result === "FAILED") return "danger";
  return "warn";
}

type View = "feed" | "broadcasts";

export function ActivityTab() {
  const [view, setView] = useState<View>("feed");
  const [profile, setProfile] = useState<UserCardDto | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<{ id: number; label: string } | null>(null);
  const [source, setSource] = useState("");
  const [result, setResult] = useState("");
  // Lifted here: a source picked on a stats card must drop an event of another source, else the
  // filter is source=SITE&type=<bot event> — always empty.
  const [type, setType] = useState("");
  const { push } = useToast();

  async function openCustomer(r: ActivityRow) {
    if (!r.tgUserId) return;
    const tgId = r.tgUserId;
    try {
      const found = await ordersApi.findUser(tgId);
      setProfile(
        found ?? {
          telegramUserId: tgId,
          username: r.customerUsername ?? null,
          firstName: r.customerName ?? null,
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

  const actions: RowActions = {
    openOrder: setOpenOrderId,
    openCustomer,
    filterCustomer: (r) => {
      if (!r.tgUserId) return;
      setCustomer({ id: r.tgUserId, label: customerLabel(r) ?? `#${r.tgUserId}` });
      setView("feed");
    },
  };

  return (
    <div className="min-w-0">
      <StatsStrip
        active={source}
        onPick={(s, failedOnly) => {
          setView("feed");
          setSource(s === source && !failedOnly ? "" : s);
          setType("");
          setResult(failedOnly ? "FAILED" : "");
        }}
      />

      <div className="mb-4 mt-1">
        <SegmentedControl<View>
          size="sm"
          options={[
            { value: "feed", label: "Лента событий" },
            { value: "broadcasts", label: "Рассылки" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "feed" ? (
        <Feed
          source={source}
          setSource={setSource}
          type={type}
          setType={setType}
          result={result}
          setResult={setResult}
          customer={customer}
          clearCustomer={() => setCustomer(null)}
          actions={actions}
        />
      ) : (
        <Broadcasts actions={actions} />
      )}

      <UserProfileDrawer user={profile} onClose={() => setProfile(null)} onOpenOrder={setOpenOrderId} />
      {/* After the profile drawer so it stacks above it. */}
      <OrderDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </div>
  );
}

interface RowActions {
  openOrder: (id: string) => void;
  openCustomer: (r: ActivityRow) => void;
  filterCustomer: (r: ActivityRow) => void;
}

// ---------------------------------------------------------------------------- 24 h counters

function StatsStrip({ active, onPick }: { active: string; onPick: (source: string, failedOnly: boolean) => void }) {
  const q = useQuery({ queryKey: ["activity-stats"], queryFn: () => activityApi.stats(24), staleTime: 30_000 });
  const stats = q.data ?? {};
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {SOURCE_ORDER.map((s) => {
        const Icon = SOURCE_ICON[s] ?? Cog;
        const st = stats[s] ?? {};
        const failed = st.failed ?? 0;
        return (
          <div
            key={s}
            className={cn(
              "card flex min-w-0 flex-col gap-1 p-3 transition-colors",
              active === s && "!border-[var(--accent)]"
            )}
          >
            <button
              type="button"
              onClick={() => onPick(s, false)}
              className="hit flex items-center gap-2 text-left"
              title="Показать только этот источник"
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <span className="font-display truncate text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {sourceLabel(s)}
              </span>
            </button>
            <span className="tabular font-display text-[20px] font-bold leading-tight text-[var(--text)]">
              {q.isLoading ? "…" : (st.total ?? 0)}
            </span>
            {failed > 0 ? (
              <button
                type="button"
                onClick={() => onPick(s, true)}
                className="hit tabular self-start text-left text-[11.5px] font-semibold text-[#F87171] hover:underline"
                title="Показать только ошибки"
              >
                {s === "BOT" ? "не доставлено" : "ошибок"}: {failed}
              </button>
            ) : (
              <span className="text-[11.5px] text-[var(--text-faint)]">без ошибок</span>
            )}
            <span className="text-[11px] text-[var(--text-faint)]">за 24 часа</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------- feed

function Feed({
  source,
  setSource,
  type,
  setType,
  result,
  setResult,
  customer,
  clearCustomer,
  actions,
}: {
  source: string;
  setSource: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  result: string;
  setResult: (v: string) => void;
  customer: { id: number; label: string } | null;
  clearCustomer: () => void;
  actions: RowActions;
}) {
  const [recipient, setRecipient] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [orderRaw, setOrderRaw] = useState("");
  const [qRaw, setQRaw] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const order = useDebounced(orderRaw.trim(), 400);
  const q = useDebounced(qRaw.trim(), 400);

  const filter: ActivityFilter = useMemo(
    () => ({
      source: source || undefined,
      type: type || undefined,
      result: result || undefined,
      recipient: recipient || undefined,
      errorCode: errorCode || undefined,
      tgUserId: customer?.id,
      order: order || undefined,
      q: q || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [source, type, result, recipient, errorCode, customer, order, q, from, to]
  );
  const filtered = Object.values(filter).some((v) => v !== undefined);

  const facetsQ = useQuery({ queryKey: ["activity-facets"], queryFn: () => activityApi.facets(), staleTime: 60_000 });
  const logQ = useInfiniteQuery({
    queryKey: ["activity", filter],
    queryFn: ({ pageParam }) => activityApi.list(filter, pageParam, PAGE),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.items.length < PAGE ? undefined : all.length),
  });
  const rows = useMemo(() => logQ.data?.pages.flatMap((p) => p.items) ?? [], [logQ.data]);
  const totals = logQ.data?.pages[0]?.totals ?? null;

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const t of facetsQ.data?.types ?? []) {
      if (source && t.source !== source) continue;
      if (seen.has(t.type)) continue;
      seen.add(t.type);
      out.push({ value: t.type, label: (source ? "" : sourceLabel(t.source) + " · ") + typeLabel(t.type) });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [facetsQ.data, source]);

  function reset() {
    setSource("");
    setType("");
    setResult("");
    setRecipient("");
    setErrorCode("");
    setOrderRaw("");
    setQRaw("");
    setFrom("");
    setTo("");
    clearCustomer();
  }

  return (
    <>
      <div className="card mb-4 grid min-w-0 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Источник"
          value={source}
          onChange={(v) => {
            setSource(v);
            setType("");
          }}
          options={[{ value: "", label: "Все источники" }, ...SOURCE_ORDER.map((s) => ({ value: s, label: sourceLabel(s) }))]}
        />
        <Select
          label="Событие"
          value={type}
          onChange={setType}
          options={[{ value: "", label: "Все события" }, ...typeOptions]}
        />
        <Select
          label="Результат"
          value={result}
          onChange={setResult}
          options={[
            { value: "", label: "Любой" },
            { value: "OK", label: "Успешно / доставлено" },
            { value: "FAILED", label: "Ошибка / не доставлено" },
            { value: "SKIPPED", label: "Пропущено" },
          ]}
        />
        <Select
          label="Кому писал бот"
          value={recipient}
          onChange={setRecipient}
          options={[
            { value: "", label: "Всем" },
            { value: "CUSTOMER", label: "Покупателям" },
            { value: "ADMINS", label: "Админам" },
          ]}
        />
        <Select
          label="Причина"
          value={errorCode}
          onChange={setErrorCode}
          options={[
            { value: "", label: "Любая" },
            ...(facetsQ.data?.errorCodes ?? []).map((c) => ({ value: c, label: errorLabel(c) })),
          ]}
        />
        <Input
          label="Заказ"
          placeholder="#1a2b3c4d или UUID"
          value={orderRaw}
          onChange={(e) => setOrderRaw(e.target.value)}
        />
        <Input
          label="Поиск"
          placeholder="текст, @username, имя, Telegram id"
          icon={<Search className="h-4 w-4" />}
          value={qRaw}
          onChange={(e) => setQRaw(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input label="С" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <Input label="По" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(filtered || customer) && (
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
            {customer && (
              <button
                type="button"
                onClick={clearCustomer}
                className="hit chip-tint !bg-[var(--surface-3)]"
                title="Убрать фильтр по покупателю"
              >
                <User className="h-3 w-3" /> {customer.label} ✕
              </button>
            )}
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
              Сбросить фильтры
            </Button>
          </div>
        )}
      </div>

      {totals && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span className="field-label !text-[var(--text-faint)]">По фильтру:</span>
          <Badge tone="ok">успешно {totals.OK ?? 0}</Badge>
          <Badge tone="danger">ошибок {totals.FAILED ?? 0}</Badge>
          <Badge tone="warn">пропущено {totals.SKIPPED ?? 0}</Badge>
        </div>
      )}

      <QueryState
        isLoading={logQ.isLoading}
        isError={logQ.isError}
        error={logQ.error}
        refetch={() => logQ.refetch()}
        loadingLabel="Загружаем события"
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Bot}
            title={filtered ? "Ничего не найдено" : "Событий пока нет"}
            description={
              filtered
                ? "Измените фильтры или период."
                : "Здесь появятся сообщения бота, заказы и оплаты с сайта и из Mini App."
            }
          />
        ) : (
          <>
            <EventList rows={rows} actions={actions} />
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="field-label tabular !text-[var(--text-faint)]">
                Показано: {rows.length}
                {facetsQ.data ? ` · хранится ${facetsQ.data.retentionDays} дн.` : ""}
              </span>
              {logQ.hasNextPage && (
                <Button variant="surface" loading={logQ.isFetchingNextPage} onClick={() => logQ.fetchNextPage()}>
                  Ещё
                </Button>
              )}
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}

// ---------------------------------------------------------------------------- rows

function EventList({ rows, actions, compact }: { rows: ActivityRow[]; actions: RowActions; compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className={cn("card overflow-hidden p-0", compact && "!rounded-[var(--r-md)]")}>
      <ul className="divide-y divide-[var(--line)]">
        {rows.map((r) => (
          <EventRow
            key={r.id}
            r={r}
            open={open === r.id}
            onToggle={() => setOpen(open === r.id ? null : r.id)}
            actions={actions}
          />
        ))}
      </ul>
    </div>
  );
}

function EventRow({
  r,
  open,
  onToggle,
  actions,
}: {
  r: ActivityRow;
  open: boolean;
  onToggle: () => void;
  actions: RowActions;
}) {
  const Icon = SOURCE_ICON[r.source] ?? Cog;
  const who = customerLabel(r);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hit grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-2)] md:grid-cols-[132px_auto_minmax(0,1fr)_auto_auto]"
      >
        <span className="tabular hidden whitespace-nowrap pt-0.5 text-[12px] text-[var(--text-muted)] md:block">
          {formatDateTime(r.createdAt)}
        </span>
        <span
          className="mt-0.5 grid h-7 w-7 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-3)] text-[var(--text-muted)]"
          title={sourceLabel(r.source)}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-[var(--text)]">{typeLabel(r.type)}</span>
            {r.recipient && (
              <span className="text-[12px] text-[var(--text-faint)]">
                → {r.recipient === "CUSTOMER" ? who ?? "покупателю" : RECIPIENT_LABEL[r.recipient] ?? r.recipient}
              </span>
            )}
            {!r.recipient && who && <span className="text-[12px] text-[var(--text-faint)]">· {who}</span>}
            {r.orderId && (
              <span className="font-mono text-[11.5px] text-[var(--text-faint)]">#{r.orderId.slice(0, 8)}</span>
            )}
          </span>
          {r.summary && (
            <span className={cn("mt-0.5 text-[12.5px] text-[var(--text-muted)]", open ? "block" : "line-clamp-1")}>
              {r.summary}
            </span>
          )}
          <span className="tabular mt-0.5 block text-[11.5px] text-[var(--text-faint)] md:hidden">
            {formatDateTime(r.createdAt)} · {sourceLabel(r.source)}
          </span>
        </span>
        <span className="col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto md:justify-end">
          <Badge tone={resultTone(r.result)} dot>
            {resultLabel(r.result, r.source)}
          </Badge>
          {r.errorCode && r.result !== "OK" && (
            <span
              className={cn(
                "text-[11.5px] font-semibold",
                r.result === "FAILED" ? "text-[#F87171]" : "text-[var(--warn)]"
              )}
            >
              {errorLabel(r.errorCode)}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "mt-1 hidden h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform md:block",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <EventDetails r={r} actions={actions} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function EventDetails({ r, actions }: { r: ActivityRow; actions: RowActions }) {
  const pairs = detailPairs(r.details);
  const unreachable = r.errorCode ? UNREACHABLE.has(r.errorCode) : false;
  return (
    <div className="border-t border-dashed border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-3 text-[12.5px] md:pl-[calc(132px+2.75rem)]">
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
        <Field label="Когда">{formatDateTime(r.createdAt)}</Field>
        <Field label="Источник">
          <Badge tone={SOURCE_TONE[r.source] ?? "neutral"}>{sourceLabel(r.source)}</Badge>
          <span className="ml-2 font-mono text-[11px] text-[var(--text-faint)]">{r.type}</span>
        </Field>
        {r.errorCode && (
          <Field label="Причина">
            <span className={r.result === "FAILED" ? "font-semibold text-[#F87171]" : "text-[var(--warn)]"}>
              {errorLabel(r.errorCode)}
            </span>
            {unreachable && (
              <span className="ml-2 text-[var(--text-faint)]">
                — бот не может написать этому человеку, пока тот снова не нажмёт /start
              </span>
            )}
            {r.errorCode === "RATE_LIMITED" && (
              <span className="ml-2 text-[var(--text-faint)]">— Telegram попросил подождать, сообщение не ушло</span>
            )}
          </Field>
        )}
        {r.error && (
          <Field label="Ответ">
            <code className="break-all font-mono text-[11.5px] text-[var(--text-muted)]">{r.error}</code>
          </Field>
        )}
        {r.recipient === "ADMINS" && r.chatId && (
          <Field label="Чат">
            <span className="font-mono text-[11.5px]">{r.chatId}</span>
          </Field>
        )}
        {r.tgUserId && (
          <Field label="Покупатель">
            {customerLabel(r)}
            {r.customerUsername && r.customerName ? (
              <span className="text-[var(--text-faint)]"> · @{r.customerUsername}</span>
            ) : null}
            <span className="ml-2 font-mono text-[11px] text-[var(--text-faint)]">tg {r.tgUserId}</span>
          </Field>
        )}
        {r.groupId && (
          <Field label="Группа">
            <span className="font-mono text-[11.5px]">{r.groupId}</span>
          </Field>
        )}
        {pairs.map(([k, v]) => (
          <Field key={k} label={k}>
            <span className="break-words">{v}</span>
          </Field>
        ))}
      </dl>
      {(r.orderId || r.tgUserId) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.orderId && (
            <Button size="sm" variant="surface" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => actions.openOrder(r.orderId!)}>
              Заказ #{r.orderId.slice(0, 8)}
            </Button>
          )}
          {r.tgUserId && (
            <>
              <Button size="sm" variant="surface" icon={<User className="h-3.5 w-3.5" />} onClick={() => actions.openCustomer(r)}>
                Профиль покупателя
              </Button>
              <Button size="sm" variant="ghost" icon={<Users className="h-3.5 w-3.5" />} onClick={() => actions.filterCustomer(r)}>
                Все события покупателя
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="field-label !normal-case pt-0.5 !text-[var(--text-faint)]">{label}</dt>
      <dd className="min-w-0 text-[var(--text)]">{children}</dd>
    </>
  );
}

// ---------------------------------------------------------------------------- broadcasts

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Все",
  active: "С заказами",
  inactive: "Без заказов",
  premium: "Premium",
};

function Broadcasts({ actions }: { actions: RowActions }) {
  const q = useQuery({ queryKey: ["activity-broadcasts"], queryFn: () => activityApi.broadcasts(30) });
  const list = q.data ?? [];
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={() => q.refetch()} loadingLabel="Загружаем рассылки">
      {list.length === 0 ? (
        <EmptyState icon={Megaphone} title="Рассылок ещё не было" description="Отправьте первую на странице «Рассылки»." />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((s) => (
            <BroadcastCard key={s.broadcast.id} s={s} actions={actions} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

function BroadcastCard({ s, actions }: { s: BroadcastSummary; actions: RowActions }) {
  const [open, setOpen] = useState(false);
  const [only, setOnly] = useState<"" | "FAILED" | "OK">("");
  const b = s.broadcast;
  const journaled = s.delivered + s.failed + s.skipped;
  // Broadcasts sent before the journal existed only have the counters of the broadcasts table.
  const delivered = journaled > 0 ? s.delivered : b.sent;
  const notDelivered = journaled > 0 ? s.failed + s.skipped : b.failed + b.blocked;
  const total = Math.max(b.total, delivered + notDelivered, 1);
  const pctOk = Math.round((delivered / total) * 100);
  const pctBad = Math.round((notDelivered / total) * 100);
  const reasons = Object.entries(s.reasons).sort((a, c) => c[1] - a[1]);
  const preview = b.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return (
    <div className="card min-w-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[13px] font-bold text-[var(--text)]">Рассылка №{b.id}</span>
            <Badge tone={b.status === "RUNNING" ? "info" : b.status === "INTERRUPTED" ? "warn" : "neutral"}>
              {b.status === "RUNNING" ? "Идёт" : b.status === "INTERRUPTED" ? "Прервана" : "Завершена"}
            </Badge>
            <span className="tabular text-[12px] text-[var(--text-muted)]">{formatDateTime(b.startedAt)}</span>
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-faint)]">
            {b.adminName ?? "—"} · аудитория: {AUDIENCE_LABEL[b.audience] ?? b.audience}
            {b.lang ? ` · язык ${b.lang.toUpperCase()}` : ""}
          </div>
          <p className="mt-2 line-clamp-2 break-words text-[13px] text-[var(--text-muted)]">{preview}</p>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-4 text-right">
          <Num label="Всего" value={b.total} />
          <Num label="Доставлено" value={delivered} tone="ok" />
          <Num label="Не доставлено" value={notDelivered} tone={notDelivered > 0 ? "danger" : undefined} />
        </div>
      </div>

      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
        <div className="h-full bg-[var(--ok)]" style={{ width: `${pctOk}%` }} />
        <div className="h-full bg-[#F87171]" style={{ width: `${pctBad}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {reasons.map(([code, n]) => (
            <Badge key={code} tone={UNREACHABLE.has(code) ? "warn" : "danger"}>
              {errorLabel(code)}: {n}
            </Badge>
          ))}
          {journaled === 0 && (
            <span className="text-[12px] text-[var(--text-faint)]">
              Подробностей по получателям нет — рассылка была до появления журнала.
            </span>
          )}
        </div>
        {journaled > 0 && (
          <Button size="sm" variant="surface" icon={<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />} onClick={() => setOpen(!open)}>
            Получатели
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <SegmentedControl<"" | "FAILED" | "OK">
            size="sm"
            options={[
              { value: "", label: "Все" },
              { value: "FAILED", label: "Не доставлено" },
              { value: "OK", label: "Доставлено" },
            ]}
            value={only}
            onChange={setOnly}
          />
          <div className="mt-2">
            <Recipients group={s.group} result={only} actions={actions} />
          </div>
        </div>
      )}
    </div>
  );
}

function Num({ label, value, tone }: { label: string; value: number; tone?: "ok" | "danger" }) {
  return (
    <div>
      <div
        className={cn(
          "tabular font-display text-[18px] font-bold",
          tone === "ok" ? "text-[var(--ok)]" : tone === "danger" ? "text-[#F87171]" : "text-[var(--text)]"
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
    </div>
  );
}

function Recipients({ group, result, actions }: { group: string; result: string; actions: RowActions }) {
  const filter: ActivityFilter = { group, result: result || undefined };
  const q = useInfiniteQuery({
    queryKey: ["activity", filter],
    queryFn: ({ pageParam }) => activityApi.list(filter, pageParam, PAGE),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.items.length < PAGE ? undefined : all.length),
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={() => q.refetch()} loadingLabel="Загружаем получателей">
      {rows.length === 0 ? (
        <p className="py-3 text-[13px] text-[var(--text-faint)]">Никого.</p>
      ) : (
        <>
          <EventList rows={rows} actions={actions} compact />
          {q.hasNextPage && (
            <div className="mt-2 text-right">
              <Button size="sm" variant="surface" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                Ещё
              </Button>
            </div>
          )}
        </>
      )}
    </QueryState>
  );
}
