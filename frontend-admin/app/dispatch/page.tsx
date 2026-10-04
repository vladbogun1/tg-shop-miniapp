"use client";

/**
 * Отправка (route "/dispatch") — the shipping-day workplace.
 *
 * Every order ready to go out, with everything the Nova Poshta form needs (copy buttons for name,
 * phone, city, branch), the cash-on-delivery amount in big letters, and — right on the card — the
 * ТТН field and "Отправлено". Clicking the card opens the full order. NEW orders can be shipped
 * straight away too (NEW → SHIPPED is allowed); those still waiting for a prepayment are flagged.
 * Refreshes itself; a failed load shows the error, never a fake "нет заказов".
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Package, Phone, Send, Truck, Hash, RefreshCw, AlertTriangle, User } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api";
import { ordersApi, type AdminDispatchOrder } from "@/lib/orders-api";
import { isNovaPoshtaTtn } from "@/lib/orders";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { PaymentBadge } from "@/components/orders/PaymentBadge";
import { QueryState } from "@/components/ui/QueryState";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/orders/CopyButton";
import { OrderDrawer } from "@/components/orders/OrderDrawer";

export default function DispatchPage() {
  const { push } = useToast();
  const qc = useQueryClient();
  const [broadcasting, setBroadcasting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["dispatch"],
    queryFn: () => ordersApi.dispatch(true),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const all = q.data ?? [];
  const approved = all.filter((o) => o.status !== "NEW");
  const fresh = all.filter((o) => o.status === "NEW");

  async function broadcast() {
    setBroadcasting(true);
    try {
      const { posted } = await adminApi.dispatchBroadcast();
      push(posted > 0 ? `Добавлено в Telegram: ${posted}` : "Все карточки уже в Telegram", "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка отправки", "error");
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Отправка"
        subtitle="Что отправлять, куда и сколько брать наложкой"
        // On a phone the title is already in the shell header: keep only the buttons.
        className="max-lg:mb-3 max-lg:[&_h1]:hidden max-lg:[&_p]:hidden"
        actions={
          <>
            <Button
              variant="surface"
              icon={<RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />}
              onClick={() => q.refetch()}
            >
              Обновить
            </Button>
            <Button
              variant="accent"
              loading={broadcasting}
              icon={<Send className="h-4 w-4" />}
              onClick={broadcast}
              disabled={approved.length === 0}
            >
              Карточки в Telegram
            </Button>
          </>
        }
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка заказов…">
        {all.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Нет заказов к отправке"
            description="Одобренные заказы появятся здесь — со всем, что нужно для отправки."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {approved.length > 0 && (
              <section className="flex flex-col gap-4">
                <SectionTitle>Одобрены · {approved.length}</SectionTitle>
                {approved.map((o) => (
                  <DispatchCard key={o.id} o={o} onOpen={() => setOpenId(o.id)} />
                ))}
              </section>
            )}
            {fresh.length > 0 && (
              <section className="flex flex-col gap-4">
                <SectionTitle>Новые — можно отправить сразу · {fresh.length}</SectionTitle>
                {fresh.map((o) => (
                  <DispatchCard key={o.id} o={o} onOpen={() => setOpenId(o.id)} />
                ))}
              </section>
            )}
          </div>
        )}
      </QueryState>

      <OrderDrawer
        orderId={openId}
        onClose={() => {
          setOpenId(null);
          qc.invalidateQueries({ queryKey: ["dispatch"] });
        }}
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-black uppercase tracking-wide text-[var(--text-muted)]">{children}</h2>;
}

/** NEW order that requires a prepayment which has not been confirmed yet. */
function awaitingPrepayment(o: AdminDispatchOrder): boolean {
  return o.status === "NEW" && o.prepaymentMinor > 0 && o.receivedMinor < o.prepaymentMinor;
}

function DispatchCard({ o, onOpen }: { o: AdminDispatchOrder; onOpen: () => void }) {
  const isPickup = o.deliveryMethod === "PICKUP";
  const waitPay = awaitingPrepayment(o);

  return (
    <div className="panel flex flex-col gap-4 p-4 sm:p-5">
      {/* Header row — click opens the order */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-[var(--line)] pb-3.5">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-left pointer-coarse:min-h-11"
          title="Открыть заказ"
        >
          <span className="inline-flex items-center gap-1 rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[13px] font-extrabold text-[var(--text)]">
            <Hash className="h-3.5 w-3.5" />
            {o.shortId}
          </span>
          {o.status === "NEW" && <Badge tone="info">Новый</Badge>}
          <span className="text-[13px] font-bold text-[var(--accent)] underline-offset-2 hover:underline pointer-coarse:py-2">открыть заказ →</span>
        </button>
        <PaymentBadge order={o} icon={false} />
      </div>

      {waitPay && (
        <div className="flex items-start gap-2 rounded-[var(--r-sm)] border-2 border-[var(--warn)] p-2.5 text-[13px] font-semibold text-[var(--text)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
          Ждём предоплату {money(o.prepaymentMinor, o.currency)} — не отправляйте, пока она не подтверждена.
        </div>
      )}

      {/* Recipient + address: one copy button per field of the Nova Poshta form */}
      <div className="grid gap-2 sm:grid-cols-2">
        <CopyField icon={<User className="h-4 w-4" />} label="Получатель" value={o.customerName} />
        <CopyField
          icon={<Phone className="h-4 w-4" />}
          label="Телефон"
          value={o.phone}
          href={`tel:${o.phone}`}
          mono
        />
        {isPickup ? (
          <CopyField icon={<MapPin className="h-4 w-4" />} label="Доставка" value="Самовывоз" noCopy />
        ) : (
          <>
            <CopyField icon={<Truck className="h-4 w-4" />} label="Город" value={o.npCityName ?? "—"} />
            <CopyField icon={<MapPin className="h-4 w-4" />} label="Отделение" value={o.npWarehouseName ?? "—"} />
          </>
        )}
      </div>

      {/* Items */}
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Товары</div>
        <ul className="flex flex-col gap-1">
          {o.items.map((it, idx) => (
            <li key={idx} className="text-[14px] font-medium text-[var(--text)]">
              <span className="text-[var(--accent)]">•</span> {it.title}
              {it.variantName ? ` (${it.variantName})` : ""} <span className="font-extrabold">× {it.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Money block */}
      <div className="flex flex-col gap-1 border-t-2 border-[var(--line)] pt-3.5 text-[13px]">
        <MoneyRow label="Сумма заказа" value={money(o.totalMinor, o.currency)} />
        {o.paymentOptionTitle && <MoneyRow label="Оплата" value={o.paymentOptionTitle} />}
        {o.receivedMinor > 0 && (
          <MoneyRow label="Получено" value={money(o.receivedMinor, o.currency)} tone="ok" />
        )}
      </div>

      {/* THE KEY LINE — big COD callout */}
      {!isPickup && <CodCallout o={o} />}

      <ShipForm o={o} />
    </div>
  );
}

function CopyField({
  icon,
  label,
  value,
  href,
  mono,
  noCopy,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
  noCopy?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-[var(--r-sm)] border-2 border-[var(--border-2)] bg-[var(--surface)] px-2.5 py-2">
      <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
        {href ? (
          <a href={href} className={cn("block truncate text-[14px] font-extrabold text-[var(--text)] hover:underline pointer-coarse:py-2.5", mono && "font-mono")}>
            {value}
          </a>
        ) : (
          <div className={cn("truncate text-[14px] font-extrabold text-[var(--text)]", mono && "font-mono")} title={value}>
            {value}
          </div>
        )}
      </div>
      {!noCopy && value !== "—" && <CopyButton value={value} label={`Скопировать: ${label.toLowerCase()}`} />}
    </div>
  );
}

function MoneyRow({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <span className={cn("font-extrabold", tone === "ok" ? "text-[var(--ok)]" : "text-[var(--text)]")}>{value}</span>
    </div>
  );
}

/** ТТН + "Отправлено" right on the card (NEW/APPROVED → SHIPPED). */
function ShipForm({ o }: { o: AdminDispatchOrder }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [ttn, setTtn] = useState("");
  const [saving, setSaving] = useState(false);
  const clean = ttn.replace(/\s+/g, "");
  const wrong = clean.length > 0 && !isNovaPoshtaTtn(clean);
  const waitPay = awaitingPrepayment(o);

  async function ship() {
    if (!clean) return;
    setSaving(true);
    try {
      await ordersApi.changeStatus(o.id, { status: "SHIPPED", trackingNumber: clean });
      push(`#${o.shortId} отправлен, ТТН ушла клиенту`, "ok");
      setTtn("");
      qc.invalidateQueries({ queryKey: ["dispatch"] });
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["orders-table"] });
      qc.invalidateQueries({ queryKey: ["order", o.id] });
    } catch (e) {
      // The typed number stays in the field.
      push(e instanceof ApiError ? e.message : "Не удалось отметить отправку", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t-2 border-[var(--line)] pt-3.5 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <Input
          aria-label="Номер ТТН"
          placeholder="ТТН: 20450000000000"
          inputMode="numeric"
          autoComplete="off"
          value={ttn}
          onChange={(e) => setTtn(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !waitPay && ship()}
          error={wrong ? "Не похоже на ТТН Новой Почты (14 цифр, начало 20/59)" : undefined}
        />
      </div>
      <Button
        variant="accent"
        loading={saving}
        disabled={!clean || waitPay}
        icon={<Send className="h-4 w-4" />}
        onClick={ship}
        title={waitPay ? "Сначала подтвердите предоплату" : undefined}
      >
        Отправлено
      </Button>
    </div>
  );
}

/**
 * The most prominent thing on the card. Bright fill + DARK text (--accent-ink)
 * for contrast in both themes, thick ink border, hard shadow.
 */
function CodCallout({ o }: { o: AdminDispatchOrder }) {
  const base =
    "rounded-[var(--r-md)] border-[3px] border-[var(--line)] px-4 py-3.5 shadow-[5px_5px_0_var(--shadow)] text-[var(--accent-ink)]";

  // Paid in full — no COD.
  if (o.codMinor === 0) {
    return (
      <div className={`${base} bg-[var(--ok)]`}>
        <div className="text-[20px] font-black uppercase leading-tight tracking-wide sm:text-[24px]">Наложка: 0</div>
        <div className="mt-0.5 text-[13px] font-bold uppercase tracking-wide opacity-80">Оплачено, без наложки</div>
      </div>
    );
  }

  // Partial prepayment — COD = total − received.
  if (o.receivedMinor > 0) {
    return (
      <div className={`${base} bg-[var(--warn)]`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[20px] font-black uppercase leading-tight tracking-wide sm:text-[26px]">
            Наложка: {money(o.codMinor, o.currency)}
          </div>
          <CopyButton value={String(Math.round(o.codMinor / 100))} label="Скопировать сумму наложки" />
        </div>
        <div className="mt-0.5 text-[12px] font-bold uppercase tracking-wide opacity-80">
          (сумма {money(o.totalMinor, o.currency)} − получено {money(o.receivedMinor, o.currency)})
        </div>
      </div>
    );
  }

  // Unpaid — full COD.
  return (
    <div className={`${base} bg-[var(--danger)]`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[20px] font-black uppercase leading-tight tracking-wide sm:text-[26px]">
          Наложка: {money(o.codMinor, o.currency)}
        </div>
        <CopyButton value={String(Math.round(o.codMinor / 100))} label="Скопировать сумму наложки" />
      </div>
      <div className="mt-0.5 text-[13px] font-bold uppercase tracking-wide opacity-80">
        {o.paymentClaimed && !o.paid ? "Оплата заявлена, но не подтверждена" : "Не оплачено"}
      </div>
    </div>
  );
}
