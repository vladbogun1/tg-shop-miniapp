"use client";

/**
 * Promocodes (route "/promocodes") — list + create/edit + delete.
 *
 *  - A code is EITHER a percent OR a fixed amount (the «% / ₴» switch); percent is 1–100.
 *  - The list shows uses, live reservations («резерв N» — customers holding the code in the cart
 *    for 30 min, which also take limited slots) and, on demand, the orders placed with the code
 *    (each opens over the page).
 *  - Editing a code that was already used warns what that means for existing orders.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Pencil, Percent, Plus, Ticket, Trash2, Wallet, AlertTriangle } from "lucide-react";
import { adminApi, ApiError, type PromoCode } from "@/lib/api";
import { extApi, type PromoCodeFull } from "@/lib/api-extra";
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
import { staggerContainer, riseItem, hoverLift } from "@/lib/motion";
import { useToast } from "@/lib/toast";
import type { OrderStatus } from "@/lib/api";

type Mode = "percent" | "amount";

const usesOf = (p: PromoCodeFull) => p.usesCount ?? 0;

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
  const promos = promosQ.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["promocodes"] });

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

      <QueryState
        isLoading={promosQ.isLoading}
        isError={promosQ.isError}
        error={promosQ.error}
        refetch={() => promosQ.refetch()}
        loadingLabel="Загрузка промокодов"
      >
        {promos.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="Промокодов пока нет"
            description="Создайте первый промокод, чтобы предлагать клиентам скидки на заказы."
            action={
              <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                Новый промокод
              </Button>
            }
          />
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-3">
            {promos.map((p) => (
              <PromoRow
                key={p.id}
                p={p}
                onEdit={() => openEdit(p)}
                onDelete={() => setConfirming(p)}
                onOpenOrder={setOpenOrderId}
              />
            ))}
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
            <div className="flex items-start gap-2 rounded-[var(--r-md)] border-2 border-[var(--warn)] bg-[var(--surface-2)] p-2.5 text-[13px] leading-snug text-[var(--text)]">
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
            <span className="text-[12px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
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
              className="font-mono font-bold text-[var(--text)]"
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
    <motion.div variants={riseItem} {...hoverLift} className="card flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
          <Ticket className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[15px] font-black tracking-wide text-[var(--text)]">{p.code}</span>
            <Badge tone={p.active ? "ok" : "neutral"} dot>
              {p.active ? "активен" : "выключен"}
            </Badge>
            {exhausted && <Badge tone="warn">лимит исчерпан</Badge>}
            {heldByReserve && <Badge tone="info">слоты в резерве</Badge>}
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
            className="hover:text-[var(--danger)]"
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
            className="hit inline-flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wide text-[var(--accent)]"
          >
            Заказы с кодом
            <ChevronDown className={showOrders ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"} />
          </button>
          {showOrders && (
            <div className="mt-2 flex flex-col gap-1.5">
              {ordersQ.isLoading ? (
                <span className="text-[12px] text-[var(--text-faint)]">Загружаем…</span>
              ) : ordersQ.isError ? (
                <span className="text-[12px] text-[var(--danger)]">Не удалось загрузить заказы</span>
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
                    <span className="font-mono font-bold text-[var(--text)]">{shortId(o.id)}</span>
                    <StatusBadge status={o.status as OrderStatus} />
                    <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{o.customerName ?? "—"}</span>
                    <span className="font-bold text-[var(--text)]">{money(o.totalMinor)}</span>
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
