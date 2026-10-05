"use client";

/**
 * CHECKOUT STEPPER — ChiSetup restyle.
 *   1. Контакты  — name + masked phone (lib/phone)
 *   2. Доставка  — NOVA_POSHTA | PICKUP. The branch is picked BY TEXT by default (city → branch
 *                  autocomplete, NpSearch) or on the map ("Обрати на карті", NpWarehouseMap); both
 *                  modes share one city / branch. The last order prefills name, phone, delivery
 *                  method and branch (card "Як у попередньому замовленні" → "Обрати інше").
 *   3. Оплата    — pick an online payment option (RadioCard, from getPaymentOptions): the whole
 *                  amount, or a prepayment now and the rest in cash on delivery. All of it is paid
 *                  through monobank (card, Apple Pay, Google Pay) within 24 h.
 *   4. Подтверждение — summary → POST /api/orders → POST /api/me/orders/{id}/payment → the
 *                  monobank page opens over the Mini App (WebApp.openLink) → the order page, which
 *                  has the "Оплатити" button again (in case the client blocked the automatic open)
 *                  and catches up with the payment when the customer comes back.
 *
 * ChiSetup chrome: graphite cards with hairline borders, Exo 2 headings, one orange CTA.
 * A compact StepProgress at the top and a FIXED bottom bar driving
 * "Назад / Далее / Оформить и оплатить" above the TabBar.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Keyboard,
  Loader2,
  Map as MapIcon,
  MapPin,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { npCityBounds, npLatLng, resolveNpWarehouse, type NpCity, type OrderDetail } from "@shop/shared";
import { trackCheckoutStart, trackOrderCreated } from "@/lib/analytics";
import { useI18n, useT } from "@/i18n/context";
import { usePromoPreview } from "@/components/cart/PromoField";
import { StepProgress } from "@/components/checkout/StepProgress";
import { CitySearch, WarehouseSearch, npWarehousesQuery } from "@/components/checkout/NpSearch";
import type { MapFocus } from "@/components/checkout/NpWarehouseMap";
import { useKeyboardOpen } from "@/lib/viewport";
import { useAccessToken } from "@/lib/auth";

/** Leaflet map is client-only (touches window) → load without SSR. */
function MapLoading() {
  const t = useT();
  return (
    <div
      className="flex items-center justify-center rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold font-display uppercase tracking-[0.08em] text-[var(--muted)] shadow-[0_8px_24px_-12px_var(--shadow)]"
      style={{ height: 320 }}
    >
      {t("checkout.delivery.mapLoading")}
    </div>
  );
}

const NpWarehouseMap = dynamic(() => import("@/components/checkout/NpWarehouseMap"), {
  ssr: false,
  loading: MapLoading,
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
} from "@/lib/api";
import { useCart, useCartSubtotal } from "@/lib/cart";
import { cartAfterOrder, flushCart } from "@/lib/cart-sync";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { formatPhone, isValidPhone, phoneE164 } from "@/lib/phone";
import { haptic, openExternalLink } from "@/lib/telegram";

const STEP_KEYS = [
  "checkout.step.contacts",
  "checkout.step.delivery",
  "checkout.step.payment",
  "checkout.step.done",
];

export default function CheckoutPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const promoCode = useCart((s) => s.promoCode);
  const setPromoCode = useCart((s) => s.setPromoCode);
  const subtotal = useCartSubtotal();
  const currency = lines[0]?.currency ?? "UAH";

  const [step, setStep] = useState(0);
  const keyboardOpen = useKeyboardOpen();

  // step 1 — contacts
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);

  // step 2 — delivery. Nova Poshta is picked by text (city → branch fields) by default, or on the
  // map; both modes edit the same city / branch, so a pick in one shows in the other. Lives here,
  // not in DeliveryStep, so it survives going to the next step and back.
  const [delivery, setDelivery] = useState<DeliveryMethod>("NOVA_POSHTA");
  const [warehouse, setWarehouse] = useState<NpWarehouse | null>(null);
  const [city, setCity] = useState<NpCity | null>(null);
  const [npMode, setNpMode] = useState<NpMode>("text");
  const [focus, setFocus] = useState<MapFocus | null>(null);
  /** The branch came from the last order — shown as a compact card until "Обрати інше". */
  const [warehouseFromLast, setWarehouseFromLast] = useState(false);
  const [comment, setComment] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const queryClient = useQueryClient();
  // The city whose branches are being fetched to frame the map: a late answer for a city the
  // customer has already moved on from must not move the map.
  const framingCity = useRef<string | null>(null);
  /** The customer has touched the delivery choice — the last-order prefill backs off. */
  const touchedNp = useRef(false);

  /** A city picked in the field (or dropped by typing over it). A different city drops the branch. */
  function chooseCity(c: NpCity | null) {
    touchedNp.current = true;
    if (c?.ref !== city?.ref) {
      setWarehouse(null);
      setWarehouseFromLast(false);
    }
    setCity(c);
    framingCity.current = c?.ref ?? null;
    if (!c) return;
    // Frame the map on the city now, so it opens there when the customer switches to it.
    queryClient
      .fetchQuery(npWarehousesQuery(c.ref))
      .then((whs) => {
        if (framingCity.current !== c.ref) return;
        const bounds = npCityBounds(whs);
        if (bounds) setFocus({ key: Date.now(), bounds });
      })
      .catch(() => {
        /* the map still works by hand */
      });
  }

  /** A branch picked in the field or on the map: select it, sync the city, aim the map at it. */
  const chooseWarehouse = useCallback((w: NpWarehouse | null) => {
    touchedNp.current = true;
    setWarehouseFromLast(false);
    setWarehouse(w);
    if (!w) return;
    if (w.cityRef) {
      setCity((c) => (c?.ref === w.cityRef ? c : { ref: w.cityRef!, name: w.cityName ?? "" }));
    }
    framingCity.current = null; // a pending city framing must not pull the map off this branch
    const p = npLatLng(w);
    if (p) setFocus({ key: Date.now(), center: p });
  }, []);

  function chooseDelivery(d: DeliveryMethod) {
    touchedNp.current = true;
    setDelivery(d);
  }

  // ---- prefill from the last order (same source as the website: /api/me/orders) ----------------
  const token = useAccessToken();
  const lastOrder = useQuery({
    queryKey: ["me", "last-order"],
    staleTime: Infinity,
    retry: false,
    // Wait for the Telegram sign-in: fired before the token, /api/me/orders answers 401 and the
    // prefill is lost for this visit (same race the account page guards against).
    enabled: !!token,
    queryFn: async (): Promise<OrderDetail | null> => {
      const list = await customerApi.getOrders();
      const latest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return latest ? customerApi.getOrder(latest.id) : null;
    },
  });
  const prefillDone = useRef(false);
  useEffect(() => {
    const o = lastOrder.data;
    if (!o || prefillDone.current) return;
    prefillDone.current = true;
    let used = false;
    if (o.customerName) {
      setName((v) => v || o.customerName);
      used = true;
    }
    if (o.phone) {
      setPhone((v) => v || o.phone);
      used = true;
    }
    if (used) setPrefilled(true);
    if (touchedNp.current) return;
    if (o.deliveryMethod === "PICKUP") {
      setDelivery("PICKUP");
      return;
    }
    if (o.npCityName && o.npWarehouseName) {
      resolveNpWarehouse(o.npCityName, o.npWarehouseName, {
        cities: (q) => customerApi.getNpCities(q),
        warehouses: (ref) => queryClient.fetchQuery(npWarehousesQuery(ref)),
      })
        .then((found) => {
          // ...unless the customer has already started picking by hand.
          if (!found || touchedNp.current) return;
          setWarehouse(found.warehouse);
          setCity(found.city);
          setWarehouseFromLast(true);
          const p = npLatLng(found.warehouse);
          if (p) setFocus({ key: Date.now(), center: p });
        })
        .catch(() => {
          /* not critical: the customer picks again */
        });
    }
  }, [lastOrder.data, queryClient]);

  // step 3 — payment
  const [paymentId, setPaymentId] = useState<string | null>(null);

  // submit
  // One key per checkout attempt: if the response is lost and the user taps again, the server
  // returns the order it already created instead of placing a second one (and deducting stock
  // twice). Regenerated only after a successful order.
  const idempotencyKey = useRef(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** The order went through — on the way to its page (the cart is already empty by then). */
  const [placedId, setPlacedId] = useState<string | null>(null);

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
  const promoValid = promo.data?.valid === true;
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
  const emptyCart = lines.length === 0 && !placedId;

  // Funnel step "started checkout": once per visit of this screen, only with something to buy.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || lines.length === 0) return;
    checkoutTracked.current = true;
    trackCheckoutStart();
  }, [lines.length]);

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
      // ONLY a code the server has just confirmed. A code it already rejected must never be sent:
      // the order came back 400 "invalid promo code", and since the field lives in the cart there
      // was no way to remove it from here — the customer was stuck on the last step for good.
      // The total shown on the button is the undiscounted one in that case, so dropping the code
      // charges exactly what was displayed.
      promoCode: promoValid ? promoCode.trim() : undefined,
      deliveryMethod: delivery,
      npCityRef: delivery === "NOVA_POSHTA" ? warehouse?.cityRef ?? undefined : undefined,
      npCityName: delivery === "NOVA_POSHTA" ? warehouse?.cityName ?? undefined : undefined,
      npWarehouseRef: delivery === "NOVA_POSHTA" ? warehouse?.ref : undefined,
      npWarehouseName:
        delivery === "NOVA_POSHTA" ? warehouse?.description : undefined,
      paymentOptionId: paymentId!,
    };
    try {
      // A quantity change still in its debounce must reach the server cart BEFORE the order removes
      // the ordered lines from it — otherwise the late write would put them back.
      await flushCart();
      const created = await customerApi.createOrder(body, idempotencyKey.current);
      const orderId = created.orderId;
      trackOrderCreated(orderId);
      haptic();
      cartAfterOrder(lines.map((l) => l.key));
      idempotencyKey.current = newIdempotencyKey();
      setPlacedId(orderId);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      // Straight to the payment page. It may not open — some clients only honour openLink from
      // a tap, and two requests have passed since — so the order page below always offers the
      // "Оплатити" button again; if it did open, the order page is waiting underneath.
      try {
        const payment = await customerApi.startPayment(orderId, locale);
        openExternalLink(payment.pageUrl);
      } catch {
        /* the order page shows why it cannot be paid, or the button to try again */
      }
      router.replace(`/account/orders/${orderId}`);
    } catch (e) {
      // The cart validated the code, so a rejection here means somebody took the last use in the
      // meantime. Drop it and let them place the order again at the price without it, instead of
      // leaving them on a step where the code cannot be edited.
      if (e instanceof ApiError && e.code === "PROMO_REJECTED") {
        setPromoCode("");
        setSubmitError(t("checkout.promoDropped", { message: e.message }));
      } else {
        setSubmitError(
          e instanceof ApiError ? e.message : t("checkout.failed")
        );
      }
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
        <h1 className="mb-6 text-[28px] font-extrabold font-display uppercase tracking-[0.02em] text-[var(--ink)]">
          {t("checkout.title")}
        </h1>
        <div className="flex flex-col items-center gap-4 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-6 py-16 text-center shadow-[0_8px_24px_-12px_var(--shadow)]">
          <p className="text-[14px] font-bold text-[var(--muted)]">{t("checkout.emptyCart")}</p>
          <Link href="/">
            <Button variant="accent">{t("common.toCatalog")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (placedId) {
    return (
      <div className="flex flex-col items-center gap-3 pt-24 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" strokeWidth={2.5} />
        <p className="font-display text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
          {t("checkout.redirecting")}
        </p>
      </div>
    );
  }

  const primaryLabel =
    step < 3 ? t("common.next") : t("checkout.submitPay", { amount: money(dueNow, currency) });

  return (
    <div className="pt-1">
      {/* Compact header: back button + current step + rail on ONE row. The previous title row
          plus a bordered step card took ~15% of the screen height before any content. */}
      <div className="mb-3 flex items-center gap-2.5">
        <motion.button
          type="button"
          aria-label={t("common.back")}
          whileTap={{ scale: 0.94 }}
          onClick={back}
          className="tap -ml-1 grid h-10 w-10 min-h-0 min-w-0 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
        <div className="min-w-0 flex-1">
          <StepProgress steps={STEP_KEYS.map((k) => t(k))} current={step} />
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
              prefilled={prefilled}
            />
          )}
          {step === 1 && (
            <DeliveryStep
              delivery={delivery}
              setDelivery={chooseDelivery}
              city={city}
              onCity={chooseCity}
              warehouse={warehouse}
              onWarehouse={chooseWarehouse}
              fromLast={warehouseFromLast}
              onChangeLast={() => {
                touchedNp.current = true;
                setWarehouseFromLast(false);
              }}
              mode={npMode}
              setMode={setNpMode}
              focus={focus}
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
        <p className="mt-4 rounded-[var(--r-card)] border border-[var(--danger)] bg-[var(--surface)] px-3 py-2 text-[13px] font-bold text-[var(--danger)] shadow-[0_8px_24px_-12px_var(--shadow)]">
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
        {/* Out of the way while the keyboard is up (as in the cart): on Android the webview shrinks
            and the bar would sit right over the city / branch suggestions. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: keyboardOpen ? 0 : 1, y: keyboardOpen ? 24 : 0 }}
          style={{ pointerEvents: keyboardOpen ? "none" : undefined }}
          transition={spring}
          className="pointer-events-auto mx-4 flex items-center gap-3 rounded-[16px] border border-[var(--line-strong)] bg-[rgba(26,26,26,.94)] p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,.8)] backdrop-blur-[12px]"
        >
          {step > 0 && (
            <Button variant="surface" onClick={back}>
              {t("common.back")}
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
  prefilled,
}: {
  name: string;
  phone: string;
  touched: boolean;
  nameOk: boolean;
  phoneOk: boolean;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  /** Name / phone came from the last order. */
  prefilled: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <p className="px-0.5 text-[13px] text-[var(--muted)]">
        {t("checkout.contacts.intro")}
      </p>
      {prefilled && (
        <p className="-mt-2 px-0.5 text-[12px] font-semibold text-[var(--ok)]">{t("checkout.prefilled")}</p>
      )}
      <Input
        label={t("checkout.contacts.name")}
        value={name}
        onChange={(e) => onName(e.target.value)}
        status={touched && !nameOk ? "danger" : nameOk ? "ok" : undefined}
        hint={touched && !nameOk ? t("checkout.contacts.nameError") : undefined}
        autoComplete="name"
      />
      <Input
        label={t("checkout.contacts.phone")}
        inputMode="tel"
        value={formatPhone(phone)}
        onChange={(e) => onPhone(e.target.value)}
        status={touched && !phoneOk ? "danger" : phoneOk ? "ok" : undefined}
        hint={
          touched && !phoneOk
            ? t("checkout.contacts.phoneError")
            : undefined
        }
        autoComplete="tel"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Delivery (2 tabs; Nova Poshta: city → branch fields, or the map)
// ---------------------------------------------------------------------------
function npLabel(w: NpWarehouse, t: (key: string, params?: Record<string, string | number>) => string): string {
  const cat = t(
    w.category === "POSTOMAT"
      ? "np.type.postomat"
      : w.category === "POINT"
        ? "np.type.point"
        : "np.type.branch"
  );
  return w.number != null ? `${cat} ${t("np.number", { n: w.number })}` : cat;
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
      className="tap flex min-h-0 flex-col items-start gap-1.5 rounded-[var(--r-card)] border p-4 text-left transition-[border-color,background-color,box-shadow] duration-150"
      style={{
        background: active
          ? "linear-gradient(0deg, var(--accent-soft), var(--accent-soft)), var(--surface)"
          : "var(--surface)",
        borderColor: active ? "var(--accent)" : "var(--line)",
        color: "var(--ink)",
        boxShadow: active ? "0 0 22px -6px rgba(255,102,0,.45)" : "none",
      }}
    >
      <span style={{ color: active ? "var(--accent)" : "var(--muted)" }}>{icon}</span>
      <span className="font-display text-[14px] font-bold uppercase leading-tight tracking-[0.06em]">
        {title}
      </span>
      <span className="text-[11px] font-medium" style={{ color: "var(--muted)" }}>
        {subtitle}
      </span>
    </motion.button>
  );
}

/** How Nova Poshta is picked: by text (city → branch fields, the default) or on the map. */
type NpMode = "text" | "map";

/** The picked branch as a card: the last order's one (badge + "Обрати інше") or the map pick. */
function WarehouseCard({
  warehouse,
  badge,
  action,
}: {
  warehouse: NpWarehouse;
  badge?: string;
  action?: React.ReactNode;
}) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex flex-col gap-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_-12px_var(--shadow)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)]">
          <MapPin className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold text-[var(--ink)]">{npLabel(warehouse, t)}</div>
          {badge && (
            <span className="font-display mt-1 inline-block rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              {badge}
            </span>
          )}
          <div className="mt-0.5 break-words text-[12px] font-medium text-[var(--muted)]">
            {warehouse.cityName ? `${warehouse.cityName}, ` : ""}
            {warehouse.description}
          </div>
        </div>
      </div>
      {action}
    </motion.div>
  );
}

/** "Ввести вручну" / "Обрати на карті" — a two-way segmented switch. */
function NpModeSwitch({ mode, setMode }: { mode: NpMode; setMode: (m: NpMode) => void }) {
  const t = useT();
  const opts: { key: NpMode; label: string; icon: React.ReactNode }[] = [
    { key: "text", label: t("checkout.np.modeText"), icon: <Keyboard className="h-4 w-4" strokeWidth={2.25} /> },
    { key: "map", label: t("checkout.np.modeMap"), icon: <MapIcon className="h-4 w-4" strokeWidth={2.25} /> },
  ];
  return (
    <div
      role="tablist"
      className="grid grid-cols-2 gap-1 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-1"
    >
      {opts.map((o) => {
        const on = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setMode(o.key)}
            className="tap flex min-h-[40px] min-w-0 items-center justify-center gap-1.5 rounded-[8px] border px-2 text-[13px] font-semibold transition-colors"
            style={{
              background: on ? "var(--accent-soft)" : "transparent",
              borderColor: on ? "var(--accent)" : "transparent",
              color: on ? "var(--accent-hi)" : "var(--muted)",
            }}
          >
            <span className="shrink-0">{o.icon}</span>
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DeliveryStep({
  delivery,
  setDelivery,
  city,
  onCity,
  warehouse,
  onWarehouse,
  fromLast,
  onChangeLast,
  mode,
  setMode,
  focus,
  comment,
  setComment,
  touched,
}: {
  delivery: DeliveryMethod;
  setDelivery: (d: DeliveryMethod) => void;
  city: NpCity | null;
  onCity: (c: NpCity | null) => void;
  warehouse: NpWarehouse | null;
  onWarehouse: (w: NpWarehouse | null) => void;
  /** The branch is the last order's one — shown as a card until "Обрати інше". */
  fromLast: boolean;
  onChangeLast: () => void;
  mode: NpMode;
  setMode: (m: NpMode) => void;
  focus: MapFocus | null;
  comment: string;
  setComment: (v: string) => void;
  touched: boolean;
}) {
  const t = useT();
  const collapsed = !!warehouse && fromLast;

  return (
    <div className="flex flex-col gap-3">
      {/* 2 tabs */}
      <div className="grid grid-cols-2 gap-2.5">
        <DeliveryTab
          active={delivery === "NOVA_POSHTA"}
          onClick={() => setDelivery("NOVA_POSHTA")}
          icon={<Truck className="h-5 w-5" />}
          title={t("checkout.delivery.np")}
          subtitle={t("checkout.delivery.npSubtitle")}
        />
        <DeliveryTab
          active={delivery === "PICKUP"}
          onClick={() => setDelivery("PICKUP")}
          icon={<Store className="h-5 w-5" />}
          title={t("checkout.delivery.pickup")}
          subtitle={t("checkout.delivery.pickupSubtitle")}
        />
      </div>

      {delivery === "NOVA_POSHTA" &&
        (collapsed && warehouse ? (
          <WarehouseCard
            warehouse={warehouse}
            badge={t("checkout.np.lastWarehouse")}
            action={
              <Button
                variant="surface"
                onClick={onChangeLast}
                icon={<MapPin className="h-4 w-4" strokeWidth={2.5} />}
              >
                {t("checkout.np.changeLast")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <NpModeSwitch mode={mode} setMode={setMode} />
            {mode === "text" ? (
              <>
                <CitySearch city={city} onCity={onCity} />
                {city && (
                  <WarehouseSearch
                    key={city.ref}
                    city={city}
                    warehouse={warehouse}
                    onWarehouse={onWarehouse}
                    label={(w) => npLabel(w, t)}
                  />
                )}
              </>
            ) : (
              <>
                <p className="px-0.5 text-[13px] text-[var(--muted)]">
                  {t("checkout.delivery.mapHint")}
                </p>
                <NpWarehouseMap focus={focus} selected={warehouse} onSelect={onWarehouse} />
                {warehouse && <WarehouseCard warehouse={warehouse} />}
              </>
            )}
          </div>
        ))}

      {touched && delivery === "NOVA_POSHTA" && !warehouse && (
        <p className="px-0.5 text-[12px] font-bold text-[var(--danger)]">
          {t("checkout.delivery.required")}
        </p>
      )}

      {delivery === "PICKUP" && (
        <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-medium leading-relaxed text-[var(--muted)] shadow-[0_8px_24px_-12px_var(--shadow)]">
          {t("checkout.delivery.pickupText")}
        </div>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("checkout.delivery.comment")}
        rows={3}
        className="tap mt-1 w-full resize-none rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[15px] font-medium text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
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
  const t = useT();
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
      <p className="rounded-[var(--r-card)] border border-[var(--danger)] bg-[var(--surface)] px-4 py-6 text-center text-[13px] font-bold text-[var(--danger)] shadow-[0_8px_24px_-12px_var(--shadow)]">
        {t("checkout.payment.error")}
      </p>
    );
  }
  if (options.length === 0) {
    return (
      <p className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-[13px] font-bold text-[var(--muted)] shadow-[0_8px_24px_-12px_var(--shadow)]">
        {t("checkout.payment.none")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {options.map((o) => {
        const prepay = o.requiresPrepayment && !!o.prepaymentMinor;
        return (
          <RadioCard
            key={o.id}
            selected={selected === o.id}
            onSelect={() => onSelect(o.id)}
            title={o.title}
            // Our own wording rather than the option description: every option is paid online
            // now, and older descriptions still talk about a transfer to a card.
            subtitle={
              prepay
                ? t("checkout.payment.prepayOnline", { amount: money(o.prepaymentMinor!, currency) })
                : t("checkout.payment.full")
            }
            icon={
              prepay ? (
                <Wallet className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <CreditCard className="h-5 w-5" strokeWidth={2.5} />
              )
            }
          />
        );
      })}
      <PaymentTrust />
    </div>
  );
}

/** "Оплата через monobank" + the 24-hour rule — under the options and on the summary. */
function PaymentTrust() {
  const t = useT();
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" strokeWidth={2.5} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--ink)]">{t("checkout.payment.trust")}</p>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{t("checkout.payment.deadline")}</p>
      </div>
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
  const t = useT();
  const deliveryText =
    delivery === "PICKUP"
      ? t("order.pickup")
      : `${t("checkout.delivery.np")} · ${warehouse?.cityName ? warehouse.cityName + ", " : ""}${warehouse?.description ?? ""}`;

  return (
    <div className="flex flex-col gap-4">
      <section className="hud-frame rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_-12px_var(--shadow)]">
        <h3 className="eyebrow mb-2 !text-[10px] !tracking-[0.2em]">
          {t("checkout.confirm.items")}
        </h3>
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--ink)]">
              {it.title}
              <span className="text-[var(--faint)]"> × {it.qty}</span>
            </span>
            <span className="font-display text-[14px] font-semibold tabular-nums text-[var(--ink)]">
              {money(it.amount, it.currency)}
            </span>
          </div>
        ))}
        <div className="my-3 h-px bg-[var(--line)]" />

        {discount > 0 && (
          <>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[13px] font-semibold text-[var(--muted)]">{t("checkout.confirm.sum")}</span>
              <span className="text-[14px] font-bold text-[var(--muted)]">
                {money(subtotal, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[13px] font-semibold text-[var(--muted)]">
                {promoCode
                  ? t("checkout.confirm.discountWithCode", { code: promoCode })
                  : t("checkout.confirm.discount")}
              </span>
              <span className="font-display text-[14px] font-bold tabular-nums text-[var(--ok)]">
                −{money(discount, currency)}
              </span>
            </div>
            <div className="my-2 h-px bg-[var(--line)]" />
          </>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold font-display uppercase tracking-[0.08em] text-[var(--ink)]">
            {t("checkout.confirm.total")}
          </span>
          <span className="font-display text-[20px] font-bold tabular-nums text-[var(--accent)]">
            {money(total, currency)}
          </span>
        </div>

        {/* Prepay options charge part of the total now and the rest on delivery — show both. */}
        {dueNow !== total && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[13px] font-bold text-[var(--ink)]">{t("checkout.confirm.dueNow")}</span>
            <span className="font-display text-[15px] font-bold tabular-nums text-[var(--ink)]">
              {money(dueNow, currency)}
            </span>
          </div>
        )}
        {dueNow !== total && (
          <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
            {t("checkout.confirm.rest", { amount: money(total - dueNow, currency) })}
          </p>
        )}

        {promoCode && discount === 0 && (
          <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">
            {t("checkout.confirm.promoProblem", {
              code: promoCode,
              message: promoMessage ?? t("checkout.confirm.promoChecking"),
            })}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_-12px_var(--shadow)]">
        <SummaryRow label={t("order.recipient")} value={`${name}, ${phone}`} />
        <SummaryRow label={t("order.delivery")} value={deliveryText} />
        <SummaryRow label={t("order.payment")} value={payment?.title ?? "—"} />
        {comment && <SummaryRow label={t("order.comment")} value={comment} />}
      </section>

      <PaymentTrust />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </span>
      <span className="text-[14px] font-medium text-[var(--ink)]">{value}</span>
    </div>
  );
}
