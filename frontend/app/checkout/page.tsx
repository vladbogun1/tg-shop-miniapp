"use client";

/**
 * CHECKOUT STEPPER (design doc §6bis): multi-step glass wizard.
 *   1. Контакты  — name + masked phone
 *   2. Доставка  — NOVA_POSHTA (city→warehouse autocomplete) | PICKUP
 *   3. Оплата    — pick a payment option
 *   4. Подтверждение — summary → POST /api/orders → success screen + requisites
 *
 * Per-step validation, back/next, Telegram MainButton drives the primary action
 * when running inside Telegram (in-page GlassButton fallback otherwise).
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  CreditCard,
  Store,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { StepProgress } from "@/components/checkout/StepProgress";
import { GlassAutocomplete } from "@/components/ui/GlassAutocomplete";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { RadioCard } from "@/components/ui/RadioCard";
import {
  ApiError,
  customerApi,
  type CreateOrderRequest,
  type DeliveryMethod,
  type NpCity,
  type NpWarehouse,
  type PaymentOption,
  type PaymentRequisites,
} from "@/lib/api";
import { useCart, useCartSubtotal } from "@/lib/cart";
import { money } from "@/lib/money";
import { formatPhone, isvalidPhone, phoneE164 } from "@/lib/phone";
import { haptic, useMainButton } from "@/lib/telegram";

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

  // step 2 — delivery
  const [delivery, setDelivery] = useState<DeliveryMethod>("NOVA_POSHTA");
  const [city, setCity] = useState<NpCity | null>(null);
  const [warehouse, setWarehouse] = useState<NpWarehouse | null>(null);
  const [comment, setComment] = useState("");

  // step 3 — payment
  const [paymentId, setPaymentId] = useState<string | null>(null);

  // submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const paymentQuery = useQuery({
    queryKey: ["payment-options"],
    queryFn: () => customerApi.getPaymentOptions(),
  });
  const paymentOptions = paymentQuery.data ?? [];
  const chosenPayment = paymentOptions.find((p) => p.id === paymentId) ?? null;

  // ---- validation ----------------------------------------------------------
  const nameOk = name.trim().length >= 2;
  const phoneOk = isvalidPhone(phone);
  const step1Ok = nameOk && phoneOk;
  const step2Ok =
    delivery === "PICKUP" || (delivery === "NOVA_POSHTA" && !!city && !!warehouse);
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
      npCityRef: delivery === "NOVA_POSHTA" ? city?.ref : undefined,
      npCityName: delivery === "NOVA_POSHTA" ? city?.name : undefined,
      npWarehouseRef: delivery === "NOVA_POSHTA" ? warehouse?.ref : undefined,
      npWarehouseName:
        delivery === "NOVA_POSHTA" ? warehouse?.description : undefined,
      paymentOptionId: paymentId!,
    };
    try {
      const { orderId } = await customerApi.createOrder(body);
      // Fetch full detail for requisites (best-effort).
      let requisites: PaymentRequisites | null | undefined;
      try {
        const detail = await customerApi.getOrder(orderId);
        requisites = detail.requisites;
      } catch {
        /* show without requisites */
      }
      haptic();
      clearCart();
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

  // Telegram MainButton (primary action per step).
  const mainText = success
    ? "Готово"
    : step < 3
      ? "Далее"
      : `Оформить · ${money(subtotal, currency)}`;
  useMainButton({
    text: mainText,
    onClick: () => {
      if (success) router.push(`/account/orders/${success.orderId}`);
      else next();
    },
    visible: !emptyCart,
    enabled: success ? true : stepOk,
    loading: submitting,
  });

  if (emptyCart) {
    return (
      <div className="pt-2">
        <h1 className="mb-6 text-[26px] font-bold text-[var(--text)]">Оформление</h1>
        <div className="glass flex flex-col items-center gap-3 rounded-[var(--r-lg)] px-6 py-14 text-center">
          <p className="text-[14px] text-[var(--text-muted)]">Корзина пуста.</p>
          <Link href="/">
            <GlassButton variant="accent">В каталог</GlassButton>
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return <SuccessScreen state={success} />;
  }

  return (
    <div className="pt-2">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Назад"
          onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
          className="tap -ml-2 flex items-center justify-center rounded-full text-[var(--text-muted)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-bold text-[var(--text)]">Оформление</h1>
      </div>

      <div className="glass mb-5 rounded-[var(--r-md)] p-3">
        <StepProgress steps={STEPS} current={step} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ type: "spring", stiffness: 360, damping: 32 }}
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
              city={city}
              setCity={(c) => {
                setCity(c);
                setWarehouse(null);
              }}
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
              city={city}
              warehouse={warehouse}
              comment={comment}
              payment={chosenPayment}
              promoCode={promoCode}
              subtotal={subtotal}
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
        <p className="mt-4 rounded-[var(--r-sm)] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] px-3 py-2 text-[13px] text-[var(--danger)]">
          {submitError}
        </p>
      )}

      {/* in-page fallback (always shown; harmless alongside MainButton) */}
      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <GlassButton variant="glass" onClick={() => setStep((s) => s - 1)}>
            Назад
          </GlassButton>
        )}
        <GlassButton
          variant="accent"
          fullWidth
          loading={submitting}
          disabled={!stepOk}
          onClick={next}
        >
          {step < 3 ? "Далее" : `Оформить · ${money(subtotal, currency)}`}
        </GlassButton>
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
      <GlassInput
        label="Имя и фамилия"
        value={name}
        onChange={(e) => onName(e.target.value)}
        status={touched && !nameOk ? "danger" : nameOk ? "ok" : undefined}
        hint={touched && !nameOk ? "Укажите имя" : undefined}
        autoComplete="name"
      />
      <GlassInput
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
// Step 2 — Delivery
// ---------------------------------------------------------------------------
function DeliveryStep({
  delivery,
  setDelivery,
  city,
  setCity,
  warehouse,
  setWarehouse,
  comment,
  setComment,
  touched,
}: {
  delivery: DeliveryMethod;
  setDelivery: (d: DeliveryMethod) => void;
  city: NpCity | null;
  setCity: (c: NpCity | null) => void;
  warehouse: NpWarehouse | null;
  setWarehouse: (w: NpWarehouse | null) => void;
  comment: string;
  setComment: (v: string) => void;
  touched: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <RadioCard
        selected={delivery === "NOVA_POSHTA"}
        onSelect={() => setDelivery("NOVA_POSHTA")}
        title="Новая Почта"
        subtitle="Доставка в отделение или почтомат"
        icon={<Truck className="h-5 w-5" />}
      />
      {delivery === "NOVA_POSHTA" && (
        <div className="flex flex-col gap-3 pl-1">
          <GlassAutocomplete<NpCity>
            label="Город"
            selectedLabel={city?.name ?? null}
            fetchItems={(q) => customerApi.getNpCities(q)}
            itemLabel={(c) => c.name}
            itemSubLabel={(c) => c.area}
            itemKey={(c) => c.ref}
            onSelect={setCity}
            onClear={() => setCity(null)}
            status={touched && !city ? "danger" : undefined}
          />
          <GlassAutocomplete<NpWarehouse>
            label="Отделение / почтомат"
            selectedLabel={warehouse?.description ?? null}
            disabled={!city}
            placeholderHint={city ? "Введите номер или адрес" : "Сначала выберите город"}
            fetchItems={(q) => customerApi.getNpWarehouses(city!.ref, q)}
            itemLabel={(w) => w.description}
            itemSubLabel={(w) =>
              w.number != null ? `№ ${w.number}` : undefined
            }
            itemKey={(w) => w.ref}
            onSelect={setWarehouse}
            onClear={() => setWarehouse(null)}
            status={touched && city && !warehouse ? "danger" : undefined}
          />
        </div>
      )}

      <RadioCard
        selected={delivery === "PICKUP"}
        onSelect={() => setDelivery("PICKUP")}
        title="Самовывоз"
        subtitle="Заберите заказ из точки магазина"
        icon={<Store className="h-5 w-5" />}
      />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Комментарий к заказу (необязательно)"
        rows={3}
        className="glass tap mt-1 w-full resize-none rounded-[var(--r-md)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
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
          <div key={i} className="shimmer h-20 rounded-[var(--r-md)]" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="glass rounded-[var(--r-md)] px-4 py-6 text-center text-[13px] text-[var(--danger)]">
        Не удалось загрузить варианты оплаты.
      </p>
    );
  }
  if (options.length === 0) {
    return (
      <p className="glass rounded-[var(--r-md)] px-4 py-6 text-center text-[13px] text-[var(--text-muted)]">
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
          icon={<CreditCard className="h-5 w-5" />}
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
  city,
  warehouse,
  comment,
  payment,
  promoCode,
  subtotal,
  currency,
  items,
}: {
  name: string;
  phone: string;
  delivery: DeliveryMethod;
  city: NpCity | null;
  warehouse: NpWarehouse | null;
  comment: string;
  payment: PaymentOption | null;
  promoCode: string;
  subtotal: number;
  currency: string;
  items: { title: string; qty: number; amount: number; currency: string }[];
}) {
  const deliveryText =
    delivery === "PICKUP"
      ? "Самовывоз"
      : `Новая Почта · ${city?.name ?? ""}, ${warehouse?.description ?? ""}`;

  return (
    <div className="flex flex-col gap-4">
      <section className="glass rounded-[var(--r-md)] p-4">
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          Состав
        </h3>
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text)]">
              {it.title}
              <span className="text-[var(--text-faint)]"> × {it.qty}</span>
            </span>
            <span className="text-[14px] font-semibold text-[var(--text)]">
              {money(it.amount, it.currency)}
            </span>
          </div>
        ))}
        <div className="my-3 h-px bg-white/10" />
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-semibold text-[var(--text)]">Итого</span>
          <span className="text-[18px] font-bold text-[var(--accent)]">
            {money(subtotal, currency)}
          </span>
        </div>
        {promoCode && (
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Промокод: {promoCode} (скидка применится на сервере)
          </p>
        )}
      </section>

      <section className="glass flex flex-col gap-3 rounded-[var(--r-md)] p-4">
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
      <span className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </span>
      <span className="text-[14px] text-[var(--text)]">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------
function SuccessScreen({ state }: { state: SuccessState }) {
  const router = useRouter();
  useMainButton({
    text: "К заказу",
    onClick: () => router.push(`/account/orders/${state.orderId}`),
  });

  const r = state.requisites;
  const reqRows = useMemo(
    () =>
      r
        ? ([
            ["Карта", r.cardNumber],
            ["IBAN", r.iban],
            ["Получатель", r.recipient],
            ["РНОКПП", r.taxId],
            ["Назначение", r.purpose],
          ].filter(([, v]) => !!v) as [string, string][])
        : [],
    [r]
  );

  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
      >
        <CheckCircle2 className="h-16 w-16" style={{ color: "var(--ok)" }} />
      </motion.div>
      <h1 className="mt-4 text-[24px] font-bold text-[var(--text)]">
        Заказ оформлен!
      </h1>
      <p className="mt-1 text-[14px] text-[var(--text-muted)]">
        Номер заказа{" "}
        <span className="font-semibold text-[var(--text)]">
          #{state.orderId.slice(0, 8)}
        </span>
      </p>

      {reqRows.length > 0 && (
        <section className="glass mt-6 w-full rounded-[var(--r-md)] p-4 text-left">
          <h3 className="mb-1 text-[14px] font-semibold text-[var(--text)]">
            Реквизиты · {state.paymentTitle}
          </h3>
          <p className="mb-3 text-[12px] text-[var(--text-muted)]">
            Оплатите по реквизитам ниже. Подтверждение — в чате заказа.
          </p>
          <div className="flex flex-col gap-2">
            {reqRows.map(([label, value]) => (
              <CopyRow key={label} label={label} value={value} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex w-full flex-col gap-3">
        <GlassButton
          variant="accent"
          fullWidth
          onClick={() => router.push(`/account/orders/${state.orderId}`)}
        >
          Перейти к заказу
        </GlassButton>
        <Link href="/" className="w-full">
          <GlassButton variant="ghost" fullWidth>
            В каталог
          </GlassButton>
        </Link>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          },
          () => {}
        );
      }}
      className="tap flex items-center justify-between gap-2 rounded-[var(--r-sm)] bg-white/5 px-3 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[11px] text-[var(--text-faint)]">{label}</span>
        <span className="block break-all text-[14px] text-[var(--text)]">{value}</span>
      </span>
      <span className="shrink-0 text-[var(--text-muted)]">
        {copied ? (
          <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </span>
    </button>
  );
}
