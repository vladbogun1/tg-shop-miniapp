"use client";

/**
 * CHECKOUT STEPPER — NEO-BRUTALISM restyle.
 *   1. Контакты  — name + masked phone (lib/phone)
 *   2. Доставка  — NOVA_POSHTA (warehouse picked on the MAP) | PICKUP
 *   3. Оплата    — pick a payment option (RadioCard, from getPaymentOptions)
 *   4. Подтверждение — summary → POST /api/orders → success screen + requisites
 *
 * Neo-brutalist chrome: thick ink borders, hard offset shadows, sharp corners,
 * heavy uppercase type. A neo StepProgress at the top and a STICKY neo bottom
 * bar driving "Назад / Далее / Оформить заказ" above the TabBar. The success
 * screen still shows the returned requisites and clears the cart as before.
 *
 * Behaviour is unchanged: same API calls (customerApi.getPaymentOptions /
 * createOrder / getOrder), same per-step validation, same query keys, same
 * dynamic ssr:false map import, same cart clear.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  MapPin,
  Store,
  Truck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { usePromoPreview } from "@/components/cart/PromoField";
import { StepProgress } from "@/components/checkout/StepProgress";

/** Leaflet map is client-only (touches window) → load without SSR. */
const NpWarehouseMap = dynamic(() => import("@/components/checkout/NpWarehouseMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] text-[13px] font-extrabold uppercase tracking-wide text-[var(--faint)] shadow-[5px_5px_0_var(--shadow)]"
      style={{ height: 320 }}
    >
      Загрузка карты…
    </div>
  ),
});
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RadioCard } from "@/components/ui/RadioCard";
import {
  ApiError,
  customerApi,
  newIdempotencyKey,
  type CreateOrderRequest,
  type DeliveryMethod,
  type NpWarehouse,
  type PaymentOption,
  type PaymentRequisites,
} from "@/lib/api";
import { useCart, useCartSubtotal } from "@/lib/cart";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { formatPhone, isValidPhone, phoneE164 } from "@/lib/phone";
import { haptic } from "@/lib/telegram";

const STEPS = ["Контакты", "Доставка", "Оплата", "Готово"];

interface SuccessState {
  orderId: string;
  paymentTitle: string;
  requisites?: PaymentRequisites | null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const promoCode = useCart((s) => s.promoCode);
  const clearCart = useCart((s) => s.clear);
  const subtotal = useCartSubtotal();
  const currency = lines[0]?.currency ?? "UAH";

  const [step, setStep] = useState(0);

  // step 1 — contacts
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);

  // step 2 — delivery (warehouse carries its own city, so no separate city picker)
  const [delivery, setDelivery] = useState<DeliveryMethod>("NOVA_POSHTA");
  const [warehouse, setWarehouse] = useState<NpWarehouse | null>(null);
  const [comment, setComment] = useState("");

  // step 3 — payment
  const [paymentId, setPaymentId] = useState<string | null>(null);

  // submit
  // One key per checkout attempt: if the response is lost and the user taps again, the server
  // returns the order it already created instead of placing a second one (and deducting stock
  // twice). Regenerated only after a successful order.
  const idempotencyKey = useRef(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const paymentQuery = useQuery({
    queryKey: ["payment-options"],
    queryFn: () => customerApi.getPaymentOptions(),
  });
  const paymentOptions = paymentQuery.data ?? [];
  const chosenPayment = paymentOptions.find((p) => p.id === paymentId) ?? null;

  // Same check the cart runs, so the two screens cannot disagree about the price — and it keeps
  // refreshing the hold on a limited code while the customer works through the steps.
  const promo = usePromoPreview(promoCode, subtotal);
  const promoPreview = promo.data;
  const discount = promo.discount;
  const total = Math.max(0, subtotal - discount);
  // What the customer pays right now: the prepayment for prepay options, otherwise the full total.
  const dueNow =
    chosenPayment?.requiresPrepayment && chosenPayment.prepaymentMinor
      ? Math.min(chosenPayment.prepaymentMinor, total)
      : total;

  // ---- validation ----------------------------------------------------------
  const nameOk = name.trim().length >= 2;
  const phoneOk = isValidPhone(phone);
  const step1Ok = nameOk && phoneOk;
  const step2Ok =
    delivery === "PICKUP" || (delivery === "NOVA_POSHTA" && !!warehouse);
  const step3Ok = !!paymentId;

  const stepOk = [step1Ok, step2Ok, step3Ok, true][step];

  // Cart guard — redirect handled by render below.
  const emptyCart = lines.length === 0 && !success;

  async function submit() {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    const body: CreateOrderRequest = {
      items: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId ?? undefined,
        quantity: l.quantity,
      })),
      customerName: name.trim(),
      phone: phoneE164(phone),
      comment: comment.trim() || undefined,
      promoCode: promoCode.trim() || undefined,
      deliveryMethod: delivery,
      npCityRef: delivery === "NOVA_POSHTA" ? warehouse?.cityRef ?? undefined : undefined,
      npCityName: delivery === "NOVA_POSHTA" ? warehouse?.cityName ?? undefined : undefined,
      npWarehouseRef: delivery === "NOVA_POSHTA" ? warehouse?.ref : undefined,
      npWarehouseName:
        delivery === "NOVA_POSHTA" ? warehouse?.description : undefined,
      paymentOptionId: paymentId!,
    };
    try {
      const created = await customerApi.createOrder(body, idempotencyKey.current);
      const orderId = created.orderId;
      // Requisites come straight back with the order; fall back to the detail fetch.
      let requisites: PaymentRequisites | null | undefined = created.requisites;
      if (!requisites) {
        try {
          const detail = await customerApi.getOrder(orderId);
          requisites = detail.requisites;
        } catch {
          /* show without requisites */
        }
      }
      haptic();
      clearCart();
      idempotencyKey.current = newIdempotencyKey();
      setSuccess({
        orderId,
        paymentTitle: chosenPayment?.title ?? "",
        requisites,
      });
    } catch (e) {
      setSubmitError(
        e instanceof ApiError ? e.message : "Не удалось оформить заказ"
      );
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setTouched(true);
    if (!stepOk) return;
    if (step < 2) {
      setTouched(false);
      setStep((s) => s + 1);
    } else if (step === 2) {
      setTouched(false);
      setStep(3); // confirmation
    } else {
      void submit();
    }
  }

  function back() {
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  }

  if (emptyCart) {
    return (
      <div className="pt-2">
        <h1 className="mb-6 text-[28px] font-black uppercase tracking-wide text-[var(--ink)]">
          Оформление
        </h1>
        <div className="flex flex-col items-center gap-4 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] px-6 py-16 text-center shadow-[5px_5px_0_var(--shadow)]">
          <p className="text-[14px] font-bold text-[var(--muted)]">Корзина пуста.</p>
          <Link href="/">
            <Button variant="accent">В каталог</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return <SuccessScreen state={success} />;
  }

  const primaryLabel = step < 3 ? "Далее" : `Оформить · ${money(total, currency)}`;

  return (
    <div className="pt-1">
      {/* Compact header: back button + current step + rail on ONE row. The previous title row
          plus a bordered step card took ~15% of the screen height before any content. */}
      <div className="mb-3 flex items-center gap-2.5">
        <motion.button
          type="button"
          aria-label="Назад"
          whileTap={{ scale: 0.94 }}
          onClick={back}
          className="tap -ml-1 grid h-10 w-10 min-h-0 min-w-0 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[3px_3px_0_var(--shadow)] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.75} />
        </motion.button>
        <div className="min-w-0 flex-1">
          <StepProgress steps={STEPS} current={step} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={spring}
        >
          {step === 0 && (
            <ContactsStep
              name={name}
              phone={phone}
              touched={touched}
              nameOk={nameOk}
              phoneOk={phoneOk}
              onName={setName}
              onPhone={setPhone}
            />
          )}
          {step === 1 && (
            <DeliveryStep
              delivery={delivery}
              setDelivery={setDelivery}
              warehouse={warehouse}
              setWarehouse={setWarehouse}
              comment={comment}
              setComment={setComment}
              touched={touched}
            />
          )}
          {step === 2 && (
            <PaymentStep
              options={paymentOptions}
              loading={paymentQuery.isLoading}
              error={paymentQuery.isError}
              selected={paymentId}
              onSelect={setPaymentId}
              currency={currency}
            />
          )}
          {step === 3 && (
            <ConfirmStep
              name={name}
              phone={formatPhone(phone)}
              delivery={delivery}
              warehouse={warehouse}
              comment={comment}
              payment={chosenPayment}
              promoCode={promoCode}
              promoMessage={promoPreview && !promoPreview.valid ? promoPreview.message ?? null : null}
              subtotal={subtotal}
              discount={discount}
              total={total}
              dueNow={dueNow}
              currency={currency}
              items={lines.map((l) => ({
                title: l.title + (l.variantName ? ` · ${l.variantName}` : ""),
                qty: l.quantity,
                amount: l.priceMinor * l.quantity,
                currency: l.currency,
              }))}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {submitError && (
        <p className="mt-4 rounded-[var(--r)] border-[3px] border-[var(--danger)] bg-[var(--surface)] px-3 py-2 text-[13px] font-bold text-[var(--danger)] shadow-[4px_4px_0_var(--shadow)]">
          {submitError}
        </p>
      )}

      {/* spacer so content never hides behind the sticky bar */}
      <div aria-hidden className="h-24" />

      {/* Bottom action bar — Назад + Далее/Оформить. FIXED, not sticky: a sticky bar only pins
          once the page is long enough to scroll past it, so on a short step (and now that the tab
          bar is hidden during checkout) it used to come to rest halfway up the screen. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-30 mx-auto w-full max-w-[480px]"
        style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 12px)" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="pointer-events-auto mx-4 flex items-center gap-3 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-3 shadow-[5px_5px_0_var(--shadow)]"
        >
          {step > 0 && (
            <Button variant="surface" onClick={back}>
              Назад
            </Button>
          )}
          <Button
            variant="accent"
            fullWidth
            className="flex-1"
            loading={submitting}
            disabled={!stepOk}
            icon={step < 3 ? <ArrowRight className="h-4 w-4" /> : undefined}
            onClick={next}
          >
            {primaryLabel}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Contacts
// ---------------------------------------------------------------------------
function ContactsStep({
  name,
  phone,
  touched,
  nameOk,
  phoneOk,
  onName,
  onPhone,
}: {
  name: string;
  phone: string;
  touched: boolean;
  nameOk: boolean;
  phoneOk: boolean;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="px-0.5 text-[13px] font-semibold text-[var(--muted)]">
        Куда и кому доставить заказ — начнём с контактов.
      </p>
      <Input
        label="Имя и фамилия"
        value={name}
        onChange={(e) => onName(e.target.value)}
        status={touched && !nameOk ? "danger" : nameOk ? "ok" : undefined}
        hint={touched && !nameOk ? "Укажите имя" : undefined}
        autoComplete="name"
      />
      <Input
        label="Телефон"
        inputMode="tel"
        value={formatPhone(phone)}
        onChange={(e) => onPhone(e.target.value)}
        status={touched && !phoneOk ? "danger" : phoneOk ? "ok" : undefined}
        hint={
          touched && !phoneOk
            ? "Введите номер: +38 (0XX) XXX-XX-XX"
            : undefined
        }
        autoComplete="tel"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Delivery (2 tabs; Nova Poshta opens the full map, then a confirm card)
// ---------------------------------------------------------------------------
function npLabel(w: NpWarehouse): string {
  const cat = w.category === "POSTOMAT" ? "Почтомат" : "Отделение";
  return w.number != null ? `${cat} № ${w.number}` : cat;
}

function DeliveryTab({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="tap flex min-h-0 flex-col items-start gap-1.5 rounded-[var(--r)] border-[3px] border-[var(--line)] p-4 text-left transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      style={{
        background: active ? "var(--accent)" : "var(--surface)",
        color: active ? "var(--accent-ink)" : "var(--ink)",
        boxShadow: active ? "5px 5px 0 var(--shadow)" : "none",
      }}
    >
      <span>{icon}</span>
      <span className="text-[14px] font-extrabold uppercase leading-tight tracking-wide">
        {title}
      </span>
      <span
        className="text-[11px] font-bold"
        style={{ color: active ? "var(--accent-ink)" : "var(--muted)" }}
      >
        {subtitle}
      </span>
    </motion.button>
  );
}

function DeliveryStep({
  delivery,
  setDelivery,
  warehouse,
  setWarehouse,
  comment,
  setComment,
  touched,
}: {
  delivery: DeliveryMethod;
  setDelivery: (d: DeliveryMethod) => void;
  warehouse: NpWarehouse | null;
  setWarehouse: (w: NpWarehouse | null) => void;
  comment: string;
  setComment: (v: string) => void;
  touched: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const showMap = delivery === "NOVA_POSHTA" && (!warehouse || editing);

  return (
    <div className="flex flex-col gap-3">
      {/* 2 tabs */}
      <div className="grid grid-cols-2 gap-2.5">
        <DeliveryTab
          active={delivery === "NOVA_POSHTA"}
          onClick={() => setDelivery("NOVA_POSHTA")}
          icon={<Truck className="h-5 w-5" />}
          title="Новая Почта"
          subtitle="Отделение / почтомат"
        />
        <DeliveryTab
          active={delivery === "PICKUP"}
          onClick={() => setDelivery("PICKUP")}
          icon={<Store className="h-5 w-5" />}
          title="Самовывоз"
          subtitle="Из точки магазина"
        />
      </div>

      {delivery === "NOVA_POSHTA" &&
        (showMap ? (
          <div className="flex flex-col gap-2">
            <p className="px-0.5 text-[13px] font-semibold text-[var(--muted)]">
              Найдите отделение на карте и нажмите «Выбрать».
            </p>
            <NpWarehouseMap
              onSelect={(w) => {
                setWarehouse(w);
                setEditing(false);
              }}
            />
            {warehouse && (
              <Button variant="surface" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            )}
          </div>
        ) : warehouse ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
            className="flex flex-col gap-3 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-4 shadow-[5px_5px_0_var(--shadow)]"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--accent)]">
                <MapPin className="h-5 w-5 text-[var(--accent-ink)]" strokeWidth={2.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold text-[var(--ink)]">
                  {npLabel(warehouse)}
                </div>
                <div className="text-[12px] font-medium text-[var(--muted)]">
                  {warehouse.cityName ? `${warehouse.cityName}, ` : ""}
                  {warehouse.description}
                </div>
              </div>
            </div>
            <Button
              variant="surface"
              onClick={() => setEditing(true)}
              icon={<MapPin className="h-4 w-4" strokeWidth={2.75} />}
            >
              Изменить отделение
            </Button>
          </motion.div>
        ) : null)}

      {touched && delivery === "NOVA_POSHTA" && !warehouse && !showMap && (
        <p className="px-0.5 text-[12px] font-bold text-[var(--danger)]">
          Выберите отделение на карте.
        </p>
      )}

      {delivery === "PICKUP" && (
        <div className="rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-medium leading-relaxed text-[var(--muted)] shadow-[5px_5px_0_var(--shadow)]">
          Заберите заказ из точки магазина — мы свяжемся с вами насчёт адреса и
          времени.
        </div>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Комментарий к заказу (необязательно)"
        rows={3}
        className="tap mt-1 w-full resize-none rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[15px] font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Payment
// ---------------------------------------------------------------------------
function PaymentStep({
  options,
  loading,
  error,
  selected,
  onSelect,
  currency,
}: {
  options: PaymentOption[];
  loading: boolean;
  error: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  currency: string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="shimmer h-20 rounded-[var(--r)]" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-[var(--r)] border-[3px] border-[var(--danger)] bg-[var(--surface)] px-4 py-6 text-center text-[13px] font-bold text-[var(--danger)] shadow-[5px_5px_0_var(--shadow)]">
        Не удалось загрузить варианты оплаты.
      </p>
    );
  }
  if (options.length === 0) {
    return (
      <p className="rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-[13px] font-bold text-[var(--muted)] shadow-[5px_5px_0_var(--shadow)]">
        Варианты оплаты не настроены.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {options.map((o) => (
        <RadioCard
          key={o.id}
          selected={selected === o.id}
          onSelect={() => onSelect(o.id)}
          title={o.title}
          subtitle={
            o.requiresPrepayment && o.prepaymentMinor
              ? `${o.description ?? ""}${o.description ? " · " : ""}Предоплата ${money(o.prepaymentMinor, currency)}`
              : o.description
          }
          icon={<CreditCard className="h-5 w-5" strokeWidth={2.5} />}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Confirmation
// ---------------------------------------------------------------------------
function ConfirmStep({
  name,
  phone,
  delivery,
  warehouse,
  comment,
  payment,
  promoCode,
  promoMessage,
  subtotal,
  discount,
  total,
  dueNow,
  currency,
  items,
}: {
  name: string;
  phone: string;
  delivery: DeliveryMethod;
  warehouse: NpWarehouse | null;
  comment: string;
  payment: PaymentOption | null;
  promoCode: string;
  /** Why the entered code does not apply, when it does not. */
  promoMessage: string | null;
  subtotal: number;
  discount: number;
  total: number;
  /** Amount payable immediately (prepayment for prepay options, otherwise the full total). */
  dueNow: number;
  currency: string;
  items: { title: string; qty: number; amount: number; currency: string }[];
}) {
  const deliveryText =
    delivery === "PICKUP"
      ? "Самовывоз"
      : `Новая Почта · ${warehouse?.cityName ? warehouse.cityName + ", " : ""}${warehouse?.description ?? ""}`;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-4 shadow-[5px_5px_0_var(--shadow)]">
        <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-[var(--faint)]">
          Состав
        </h3>
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--ink)]">
              {it.title}
              <span className="text-[var(--faint)]"> × {it.qty}</span>
            </span>
            <span className="text-[14px] font-extrabold text-[var(--ink)]">
              {money(it.amount, it.currency)}
            </span>
          </div>
        ))}
        <div className="my-3 h-[2.5px] bg-[var(--line)]" />

        {discount > 0 && (
          <>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[13px] font-semibold text-[var(--muted)]">Сумма</span>
              <span className="text-[14px] font-bold text-[var(--muted)]">
                {money(subtotal, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[13px] font-semibold text-[var(--muted)]">
                Скидка{promoCode ? ` · ${promoCode}` : ""}
              </span>
              <span className="text-[14px] font-extrabold text-[var(--ok)]">
                −{money(discount, currency)}
              </span>
            </div>
            <div className="my-2 h-[2px] bg-[var(--line)]" />
          </>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[15px] font-black uppercase tracking-wide text-[var(--ink)]">
            Итого
          </span>
          <span className="border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[18px] font-black text-[var(--ink)]">
            {money(total, currency)}
          </span>
        </div>

        {/* Prepay options charge part of the total now and the rest on delivery — show both. */}
        {dueNow !== total && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[13px] font-bold text-[var(--ink)]">К оплате сейчас</span>
            <span className="text-[15px] font-black text-[var(--ink)]">
              {money(dueNow, currency)}
            </span>
          </div>
        )}
        {dueNow !== total && (
          <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
            Остаток {money(total - dueNow, currency)} — при получении.
          </p>
        )}

        {promoCode && discount === 0 && (
          <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">
            Промокод «{promoCode}»: {promoMessage ?? "проверяем…"}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-4 shadow-[5px_5px_0_var(--shadow)]">
        <SummaryRow label="Получатель" value={`${name}, ${phone}`} />
        <SummaryRow label="Доставка" value={deliveryText} />
        <SummaryRow label="Оплата" value={payment?.title ?? "—"} />
        {comment && <SummaryRow label="Комментарий" value={comment} />}
      </section>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-black uppercase tracking-wide text-[var(--faint)]">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-[var(--ink)]">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------
function SuccessScreen({ state }: { state: SuccessState }) {
  const router = useRouter();

  const r = state.requisites;
  const reqRows = useMemo(
    () =>
      r
        ? ([
            ["Карта", r.cardNumber],
            ["IBAN", r.iban],
            ["Получатель", r.recipient],
            ["РНОКПП", r.edrpou],
            ["Назначение", r.purpose],
            ["Примечание", r.note],
          ].filter(([, v]) => !!v) as [string, string][])
        : [],
    [r]
  );

  return (
    <div className="flex flex-col items-center pt-8 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="grid h-20 w-20 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--c4)] shadow-[5px_5px_0_var(--shadow)]"
      >
        <CheckCircle2 className="h-11 w-11 text-[var(--ink)]" strokeWidth={2.5} />
      </motion.div>
      <h1 className="mt-5 text-[24px] font-black uppercase tracking-wide text-[var(--ink)]">
        Заказ оформлен!
      </h1>
      <p className="mt-1 text-[14px] font-semibold text-[var(--muted)]">
        Номер заказа{" "}
        <span className="font-black text-[var(--ink)]">
          #{state.orderId.slice(0, 8)}
        </span>
      </p>

      {reqRows.length > 0 && (
        <section className="mt-6 w-full rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[5px_5px_0_var(--shadow)]">
          <h3 className="mb-1 text-[14px] font-black uppercase tracking-wide text-[var(--ink)]">
            Реквизиты · {state.paymentTitle}
          </h3>
          <p className="mb-3 text-[12px] font-medium text-[var(--muted)]">
            Оплатите по реквизитам ниже. Подтверждение — в чате заказа.
          </p>
          <div className="flex flex-col gap-2">
            {reqRows.map(([label, value]) => (
              <CopyRow key={label} label={label} value={value} />
            ))}
          </div>
        </section>
      )}

      <PaymentProof orderId={state.orderId} />

      <div className="mt-6 flex w-full flex-col gap-3">
        <Button
          variant="accent"
          fullWidth
          onClick={() => router.push(`/account/orders/${state.orderId}`)}
        >
          Перейти к заказу
        </Button>
        <Link href="/" className="w-full">
          <Button variant="ghost" fullWidth>
            В каталог
          </Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * Payment confirmation — upload a transfer screenshot.
 *
 * The screenshot is posted into the order chat and flags the order as "payment claimed". It does
 * NOT mark the order paid: a picture is not money, and treating it as proof used to zero out the
 * cash-on-delivery amount on the seller's dispatch card. An admin checks the transfer and confirms.
 */
function PaymentProof({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState("uploading");
    setErr(null);
    try {
      const { url } = await customerApi.uploadAttachment(file);
      await customerApi.submitPaymentProof(orderId, {
        type: "PHOTO",
        attachmentUrl: url,
        fileName: file.name,
        mimeType: file.type,
      });
      haptic();
      setState("done");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Не удалось отправить скрин");
      setState("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (state === "done") {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 w-full rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--c4)] p-4 text-left shadow-[5px_5px_0_var(--shadow)]"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-[var(--ink)]" strokeWidth={2.75} />
          <span className="text-[14px] font-black uppercase tracking-wide text-[var(--ink)]">
            Оплата на проверке
          </span>
        </div>
        <p className="mt-1 text-[12px] font-bold text-[var(--ink)]">
          Скрин перевода отправлен в чат заказа. Менеджер проверит поступление и подтвердит оплату.
        </p>
      </motion.section>
    );
  }

  return (
    <section className="mt-6 w-full rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[5px_5px_0_var(--shadow)]">
      <h3 className="text-[14px] font-black uppercase tracking-wide text-[var(--ink)]">
        Подтверждение перевода
      </h3>
      <p className="mt-1 mb-3 text-[12px] font-medium text-[var(--muted)]">
        Оплатили? Загрузите скриншот перевода — он попадёт в чат заказа, менеджер проверит
        поступление и подтвердит оплату.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFile}
      />
      <Button
        variant="accent"
        fullWidth
        loading={state === "uploading"}
        icon={<Upload className="h-4 w-4" strokeWidth={2.75} />}
        onClick={() => inputRef.current?.click()}
      >
        Загрузить скрин перевода
      </Button>
      {err && (
        <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{err}</p>
      )}
      <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">
        Можно оплатить позже — со страницы заказа
      </p>
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        haptic();
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          },
          () => {}
        );
      }}
      className="tap flex items-center justify-between gap-2 rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-left transition-transform active:translate-x-[2px] active:translate-y-[2px]"
    >
      <span className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-wide text-[var(--faint)]">
          {label}
        </span>
        <span className="block break-all text-[14px] font-bold text-[var(--ink)]">
          {value}
        </span>
      </span>
      <span className="shrink-0 text-[var(--ink)]">
        {copied ? (
          <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.75} />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={2.75} />
        )}
      </span>
    </button>
  );
}
