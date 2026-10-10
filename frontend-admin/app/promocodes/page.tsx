"use client";

/**
 * Promocodes (route "/promocodes") — list + create/edit + delete.
 *
 *  - A code is EITHER a percent OR a fixed amount (the «% / ₴» switch); percent is 1–100.
 *  - The list shows uses, live reservations («резерв N» — customers holding the code in the cart
 *    for 30 min, which also take limited slots) and, on demand, the orders placed with the code
 *    (each opens over the page).
 *  - Editing a code that was already used warns what that means for existing orders.
 *  - Three tabs, so the owner's codes are not buried under generated ones (`?tab=` keeps it):
 *    «Наши» — shared codes made here (default); «Персональные скидки» — codes for one customer plus
 *    orders with a manual amount/percent discount («Ручная скидка», not a code); «За отзывы» —
 *    automatic review bonuses. Search and the status filter work inside the open tab.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Pencil, Percent, Plus, Search, Ticket, Trash2, Wallet, AlertTriangle, UserRound } from "lucide-react";
import { adminApi, ApiError, type PromoCode } from "@/lib/api";
import {
  extApi,
  promoOrigin,
  type ManualDiscountOrder,
  type PromoCodeFull,
  type PromoOrigin,
} from "@/lib/api-extra";
import { money, toMajor, toMinor } from "@/lib/money";
import { formatDateTime, shortId } from "@/lib/orders";
import { PageHeader } from "@/components/layout/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { staggerContainer, riseItem } from "@/lib/motion";
import { useToast } from "@/lib/toast";
import type { OrderStatus } from "@/lib/api";

type Mode = "percent" | "amount";
type StateFilter = "all" | "live" | "off";

const usesOf = (p: PromoCodeFull) => p.usesCount ?? 0;

const TABS: PromoOrigin[] = ["OURS", "PERSONAL", "REVIEW"];
const TAB_LABEL: Record<PromoOrigin, string> = { OURS: "Наши", PERSONAL: "Персональные скидки", REVIEW: "За отзывы" };
/** Phones: the full labels do not fit 343 px in one row. */
const TAB_LABEL_SHORT: Record<PromoOrigin, string> = { OURS: "Наши", PERSONAL: "Личные", REVIEW: "За отзывы" };
const TAB_EMPTY: Record<PromoOrigin, { title: string; text: string }> = {
  OURS: { title: "Своих промокодов пока нет", text: "Создайте промокод, чтобы предлагать клиентам скидки на заказы." },
  PERSONAL: {
    title: "Персональных скидок нет",
    text: "Здесь появятся коды для одного клиента и ручные скидки, которые вы дали в заказах.",
  },
  REVIEW: { title: "Бонусов за отзывы нет", text: "Код выдаётся автоматически, когда клиент оставляет отзыв о заказе." },
};

/** Can a customer still use it right now? */
function isLive(p: PromoCodeFull, now: number) {
  if (!p.active) return false;
  if (p.expiresAt && new Date(p.expiresAt).getTime() < now) return false;
  return !(p.maxUses && usesOf(p) >= p.maxUses);
}

export default function PromocodesPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCodeFull | null>(null);
  const [confirming, setConfirming] = useState<PromoCodeFull | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const promosQ = useQuery({
    queryKey: ["promocodes"],
    queryFn: () => extApi.promocodes(),
  });
  const promos = useMemo(() => promosQ.data ?? [], [promosQ.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["promocodes"] });

  // Tabs + filters (URL `?tab=personal|review` so a reload / a link keeps the tab).
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<PromoOrigin>("OURS");
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab")?.toUpperCase() as PromoOrigin | undefined;
    if (t && TABS.includes(t)) setTab(t);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const qs = tab === "OURS" ? "" : `?tab=${tab.toLowerCase()}`;
    window.history.replaceState(null, "", window.location.pathname + qs);
  }, [ready, tab]);

  // Manual order discounts are not codes: a separate list (an older backend has no endpoint → []).
  const manualQ = useQuery({
    queryKey: ["promocodes", "manual-discounts"],
    queryFn: () => extApi.manualDiscounts().catch(() => [] as ManualDiscountOrder[]),
  });
  const manual = useMemo(() => manualQ.data ?? [], [manualQ.data]);

  const byTab = useMemo(() => {
    const m: Record<PromoOrigin, PromoCodeFull[]> = { OURS: [], PERSONAL: [], REVIEW: [] };
    for (const p of promos) m[promoOrigin(p)].push(p);
    return m;
  }, [promos]);
  const counts: Record<PromoOrigin, number> = {
    OURS: byTab.OURS.length,
    PERSONAL: byTab.PERSONAL.length + manual.length,
    REVIEW: byTab.REVIEW.length,
  };

  const needle = query.trim().toLowerCase();
  const now = Date.now();
  const shown = byTab[tab].filter((p) => {
    if (needle && !p.code.toLowerCase().includes(needle) && !String(p.ownerUserId ?? "").includes(needle)) return false;
    if (stateFilter === "live") return isLive(p, now);
    if (stateFilter === "off") return !isLive(p, now);
    return true;
  });
  // A manual discount has no state of its own — the status filter hides it only when "выключенные".
  const shownManual =
    tab !== "PERSONAL" || stateFilter === "off"
      ? []
      : manual.filter(
          (o) =>
            !needle ||
            (o.customerName ?? "").toLowerCase().includes(needle) ||
            o.label.toLowerCase().includes(needle) ||
            o.id.toLowerCase().startsWith(needle) ||
            String(o.tgUserId ?? "").includes(needle)
        );
  const filtering = !!needle || stateFilter !== "all";
  const reviewUsed = byTab.REVIEW.filter((p) => usesOf(p) > 0).length;

  // form state
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<Mode>("percent");
  const [percent, setPercent] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? "");
    const isAmount = !!editing?.discountAmountMinor;
    setMode(isAmount ? "amount" : "percent");
    setPercent(editing?.discountPercent ? String(editing.discountPercent) : "");
    setAmountMajor(editing?.discountAmountMinor ? String(toMajor(editing.discountAmountMinor)) : "");
    setMaxUses(editing?.maxUses ? String(editing.maxUses) : "");
    setActive(editing?.active ?? true);
  }, [open, editing]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(p: PromoCodeFull) {
    setEditing(p);
    setOpen(true);
  }

  // Validation (the server checks the same — this is for a clear message before the request).
  const percentNum = Number(percent.replace(",", "."));
  const percentErr =
    mode !== "percent"
      ? null
      : !percent.trim()
        ? "Укажите процент"
        : !Number.isInteger(percentNum) || percentNum < 1 || percentNum > 100
          ? "Целое число от 1 до 100"
          : null;
  const amountErr =
    mode !== "amount" ? null : !amountMajor.trim() || toMinor(amountMajor) <= 0 ? "Укажите сумму больше 0" : null;
  const maxUsesNum = Number(maxUses);
  const maxUsesErr =
    maxUses.trim() && (!Number.isInteger(maxUsesNum) || maxUsesNum < 1) ? "Целое число от 1 или пусто" : null;
  const editingUses = editing ? usesOf(editing) : 0;
  const renamed = !!editing && code.trim().toUpperCase() !== editing.code;

  async function save() {
    if (!code.trim()) return push("Укажите код", "error");
    const err = percentErr ?? amountErr ?? maxUsesErr;
    if (err) return push(err, "error");
    const body: Partial<PromoCode> = {
      code: code.trim().toUpperCase(),
      discountPercent: mode === "percent" ? percentNum : null,
      discountAmountMinor: mode === "amount" ? toMinor(amountMajor) : null,
      maxUses: maxUses.trim() ? maxUsesNum : null,
      active,
    };
    setSaving(true);
    try {
      if (editing) await adminApi.updatePromo(editing.id, body);
      else await adminApi.createPromo(body);
      push("Сохранено", "ok");
      // A code made here is always «Наши» — show it where it landed.
      if (!editing) setTab("OURS");
      refresh();
      setOpen(false);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: PromoCodeFull) {
    setDeleting(true);
    try {
      await adminApi.deletePromo(p.id);
      push("Промокод удалён", "ok");
      refresh();
      setConfirming(null);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Промокоды"
        subtitle="Скидки для клиентов — процент или фиксированная сумма"
        actions={
          <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Новый промокод
          </Button>
        }
      />

      {/* Two copies, one per width: the full labels do not fit a phone in one row. The wrappers hide
          them — SegmentedControl's own `inline-flex` would win over a `hidden` passed in. */}
      <div className="mb-3 sm:hidden">
        <SegmentedControl<PromoOrigin>
          size="sm"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL_SHORT[t], count: promosQ.isSuccess ? counts[t] : undefined }))}
        />
      </div>
      <div className="mb-3 hidden sm:block">
        <SegmentedControl<PromoOrigin>
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: promosQ.isSuccess ? counts[t] : undefined }))}
        />
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Поиск промокода"
            placeholder={tab === "PERSONAL" ? "Код, клиент, № заказа или Telegram id" : "Код или Telegram id"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <SegmentedControl<StateFilter>
          size="sm"
          value={stateFilter}
          onChange={setStateFilter}
          options={[
            { value: "all", label: "Все" },
            { value: "live", label: "Действуют" },
            { value: "off", label: "Не действуют" },
          ]}
        />
      </div>
      {tab === "REVIEW" && byTab.REVIEW.length > 0 && (
        <p className="mb-3 text-[12.5px] text-[var(--text-muted)]">
          Выдаются автоматически за отзыв о заказе — личные, на один раз. Выдано {byTab.REVIEW.length}, использовано{" "}
          {reviewUsed}.
        </p>
      )}

      <QueryState
        isLoading={promosQ.isLoading || !ready}
        isError={promosQ.isError}
        error={promosQ.error}
        refetch={() => promosQ.refetch()}
        loadingLabel="Загрузка промокодов"
      >
        {shown.length === 0 && shownManual.length === 0 ? (
          filtering ? (
            <EmptyState
              icon={Search}
              title="Ничего не найдено"
              description="В этой вкладке нет кодов под условия поиска."
              action={
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuery("");
                    setStateFilter("all");
                  }}
                >
                  Сбросить фильтры
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Ticket}
              title={TAB_EMPTY[tab].title}
              description={TAB_EMPTY[tab].text}
              action={
                tab === "OURS" ? (
                  <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                    Новый промокод
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <motion.div
            key={tab}
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="flex flex-col gap-3"
          >
            {shown.map((p) => (
              <PromoRow
                key={p.id}
                p={p}
                onEdit={() => openEdit(p)}
                onDelete={() => setConfirming(p)}
                onOpenOrder={setOpenOrderId}
              />
            ))}
            {shownManual.length > 0 && (
              <>
                <motion.div variants={riseItem} className="mt-2">
                  <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    Ручные скидки в заказах · {shownManual.length}
                  </h2>
                  <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">
                    Сумма или процент, заданные вручную в «Скидке» заказа — это не промокод, повторно не применяется.
                  </p>
                </motion.div>
                {shownManual.map((o) => (
                  <ManualRow key={o.id} o={o} onOpen={() => setOpenOrderId(o.id)} />
                ))}
              </>
            )}
          </motion.div>
        )}
      </QueryState>

      {/* create / edit */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeOnBackdrop={false}
        title={editing ? "Редактировать промокод" : "Новый промокод"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button variant="accent" loading={saving} onClick={save}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {editingUses > 0 && (
            <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-2.5 text-[13px] leading-snug text-[var(--text)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
              <span>
                Код уже применили {editingUses} раз. Скидка в этих заказах не изменится — правка коснётся только
                новых заказов.
                {renamed && " После переименования старые заказы останутся со старым кодом, а клиенты, которым вы его дали, получат «код не найден»."}
              </span>
            </div>
          )}
          <Input
            label="Код"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SUMMER25"
            className="font-mono tracking-wide"
            icon={<Ticket className="h-4 w-4" />}
          />
          <div className="flex flex-col gap-2">
            <span className="field-label">
              Тип скидки
            </span>
            <SegmentedControl<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "percent", label: "% от суммы" },
                { value: "amount", label: "₴ фиксированная" },
              ]}
            />
          </div>
          {mode === "percent" ? (
            <Input
              label="Скидка, %"
              inputMode="numeric"
              value={percent}
              error={percent.trim() ? (percentErr ?? undefined) : undefined}
              onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ""))}
              icon={<Percent className="h-4 w-4" />}
            />
          ) : (
            <Input
              label="Скидка, ₴"
              inputMode="decimal"
              value={amountMajor}
              error={amountMajor.trim() ? (amountErr ?? undefined) : undefined}
              onChange={(e) => setAmountMajor(e.target.value)}
              icon={<Wallet className="h-4 w-4" />}
            />
          )}
          <Input
            label="Макс. использований"
            hint="Пусто = без лимита. Покупатель с кодом в корзине держит слот 30 минут."
            inputMode="numeric"
            value={maxUses}
            error={maxUsesErr ?? undefined}
            onChange={(e) => setMaxUses(e.target.value.replace(/[^\d]/g, ""))}
          />
          <div className="card-2 rounded-[var(--r-md)] px-3.5 py-3">
            <Toggle checked={active} onChange={setActive} label="Активен" />
          </div>
        </div>
      </Modal>

      {/* delete confirm */}
      <Modal
        open={!!confirming}
        onClose={() => (deleting ? undefined : setConfirming(null))}
        title="Удалить промокод?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(null)}>
              Отмена
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => confirming && remove(confirming)}>
              Удалить
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
          Промокод{" "}
          <AnimatePresence mode="wait">
            <motion.span
              key={confirming?.id ?? "none"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-mono font-semibold text-[var(--text)]"
            >
              {confirming?.code}
            </motion.span>
          </AnimatePresence>{" "}
          будет удалён без возможности восстановления.
          {confirming && usesOf(confirming) > 0
            ? ` Его уже применили ${usesOf(confirming)} раз — эти заказы сохранят скидку. Чтобы просто остановить код, лучше выключите его.`
            : ""}
        </p>
      </Modal>

      <OrderDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </div>
  );
}

function PromoRow({
  p,
  onEdit,
  onDelete,
  onOpenOrder,
}: {
  p: PromoCodeFull;
  onEdit: () => void;
  onDelete: () => void;
  onOpenOrder: (id: string) => void;
}) {
  const [showOrders, setShowOrders] = useState(false);
  const limited = !!p.maxUses;
  const used = usesOf(p);
  const reserved = p.reservedCount ?? 0;
  const exhausted = limited && used >= (p.maxUses ?? 0);
  const heldByReserve = limited && !exhausted && used + reserved >= (p.maxUses ?? 0);

  const ordersQ = useQuery({
    queryKey: ["promo-orders", p.id],
    queryFn: () => extApi.promoOrders(p.id),
    enabled: showOrders,
  });

  return (
    <motion.div variants={riseItem} className="card card-hover flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center gap-4">
        <div className="accent-tint grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)]">
          <Ticket className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[15px] font-semibold tracking-wide text-[var(--ink)]">{p.code}</span>
            <Badge tone={p.active ? "ok" : "neutral"} dot>
              {p.active ? "активен" : "выключен"}
            </Badge>
            {exhausted && <Badge tone="warn">лимит исчерпан</Badge>}
            {heldByReserve && <Badge tone="info">слоты в резерве</Badge>}
            {promoOrigin(p) !== "OURS" && (
              <Badge tone="accent">
                {promoOrigin(p) === "REVIEW" ? "бонус за отзыв" : "личный"}
                {p.ownerUserId != null ? ` · tg ${p.ownerUserId}` : ""}
              </Badge>
            )}
            {p.expiresAt && (
              <Badge tone={new Date(p.expiresAt).getTime() < Date.now() ? "warn" : "neutral"}>
                {new Date(p.expiresAt).getTime() < Date.now() ? "истёк" : "до"} {formatDateTime(p.expiresAt)}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
            {p.discountAmountMinor ? (
              <span className="inline-flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5 text-[var(--text-faint)]" />−{money(p.discountAmountMinor)}
              </span>
            ) : p.discountPercent ? (
              <span className="inline-flex items-center gap-1">
                <Percent className="h-3.5 w-3.5 text-[var(--text-faint)]" />
                {p.discountPercent}% скидка
              </span>
            ) : null}
            <span className="text-[var(--text-faint)]">
              {limited ? `Использовано ${used} / ${p.maxUses}` : `Использовано ${used} · без лимита`}
              {reserved > 0 ? ` · резерв ${reserved}` : ""}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="icon" aria-label="Редактировать" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Удалить"
            className="hover:text-[var(--danger-ink)]"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {used > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowOrders((v) => !v)}
            className="hit inline-flex items-center gap-1 font-display text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
          >
            Заказы с кодом
            <ChevronDown className={showOrders ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"} />
          </button>
          {showOrders && (
            <div className="mt-2 flex flex-col gap-1.5">
              {ordersQ.isLoading ? (
                <span className="text-[12px] text-[var(--text-faint)]">Загружаем…</span>
              ) : ordersQ.isError ? (
                <span className="text-[12px] text-[var(--danger-ink)]">Не удалось загрузить заказы</span>
              ) : (ordersQ.data ?? []).length === 0 ? (
                <span className="text-[12px] text-[var(--text-faint)]">
                  Заказов с этим кодом нет (возможно, их удалили или код переименовали).
                </span>
              ) : (
                (ordersQ.data ?? []).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onOpenOrder(o.id)}
                    className="card-2 flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left text-[12.5px] hover:bg-[var(--surface-hover)]"
                  >
                    <span className="font-mono font-semibold text-[var(--text)]">{shortId(o.id)}</span>
                    <StatusBadge status={o.status as OrderStatus} />
                    <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{o.customerName ?? "—"}</span>
                    <span className="tabular font-semibold text-[var(--text)]">{money(o.totalMinor)}</span>
                    <span className="text-[var(--ok)]">−{money(o.discountMinor)}</span>
                    <span className="text-[var(--text-faint)]">{formatDateTime(o.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

/** An order with a manual amount/percent discount — opens the order. */
function ManualRow({ o, onOpen }: { o: ManualDiscountOrder; onOpen: () => void }) {
  return (
    <motion.button
      variants={riseItem}
      type="button"
      onClick={onOpen}
      className="card card-hover flex items-center gap-4 px-4 py-3 text-left"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--surface-3)] text-[var(--text-muted)]">
        <UserRound className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--ink)]">{o.customerName || "Без имени"}</span>
          <StatusBadge status={o.status as OrderStatus} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
          <span>{o.label}</span>
          <span className="font-semibold text-[var(--ok)]">−{money(o.discountMinor)}</span>
          <span className="text-[var(--text-faint)]">
            заказ {shortId(o.id)} · {money(o.totalMinor)} · {formatDateTime(o.createdAt)}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
