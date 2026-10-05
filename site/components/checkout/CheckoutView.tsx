"use client";

/**
 * Checkout — ONE page, two columns on desktop (vinli-style), stacked on phones.
 *
 * Left: recipient (prefilled from the last order) · delivery (Nova Poshta on the map + city
 * search, or pickup) · payment options as radio cards · promo · comment.
 * Right: sticky summary with the total and the submit button.
 *
 * Order creation is exactly the Mini App's (frontend/app/checkout/page.tsx): POST /api/orders with
 * an Idempotency-Key per attempt, the promo code sent ONLY when the server has just confirmed it,
 * and PROMO_REJECTED handled by dropping the code and asking for one more click. The difference is
 * the session: the website is signed in with cookies, so a guest is sent to /login first.
 *
 * Payment is online only (monobank acquiring, see docs/MONOBANK-ACQUIRING.md): right after the
 * order is created, POST /api/me/orders/{id}/payment opens an invoice and the browser goes to
 * monobank's page. If that fails, the order page takes over — it has the "Pay" button and the error.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, MapPin, Store, Truck, Wallet } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeliveryMethod, NpCity, NpWarehouse, OrderDetail } from "@shop/shared";
import { goToPayment, PaymentTrust, rememberPaymentError, usePageRestore } from "@/components/order/Payment";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RadioCard } from "@/components/ui/RadioCard";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n";
import { trackCheckoutStart, trackOrderCreated } from "@/lib/analytics";
import { api, ApiError, newIdempotencyKey, type CreateOrderRequest } from "@/lib/api";
import { useCart, useCartSubtotal } from "@/lib/cart";
import { useCartValidation } from "@/lib/cart-validation";
import { cartAfterOrder, flushCart } from "@/lib/cart-sync";
import { useHydrated } from "@/lib/hooks";
import { Image } from "@/lib/image";
import { formatPhone, isValidPhone, phoneE164 } from "@/lib/phone";
import { useSession } from "@/lib/session";
import { npCityBounds, npLatLng, resolveNpWarehouse } from "@shop/shared";
import { useFmt } from "@/lib/use-fmt";
import { CitySearch, WarehouseSearch, npWarehousesQuery } from "./CitySearch";
import type { MapFocus } from "./NpWarehouseMap";
import { PromoField, usePromoPreview } from "./PromoField";

function MapLoading() {
  const { t } = useI18n();
  return (
    <div className="shimmer grid h-[420px] place-items-center rounded-[var(--r-card)] font-display text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
      {t("checkout.mapLoading")}
    </div>
  );
}

const NpWarehouseMap = dynamic(() => import("./NpWarehouseMap"), { ssr: false, loading: MapLoading });

function npLabel(w: NpWarehouse, t: (k: MessageKey, p?: Record<string, string | number>) => string): string {
  const cat = t(w.category === "POSTOMAT" ? "np.type.postomat" : w.category === "POINT" ? "np.type.point" : "np.type.branch");
  return w.number != null ? `${cat} ${t("np.number", { n: w.number })}` : cat;
}

export function CheckoutView() {
  const { t, href } = useI18n();
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  const lines = useCart((s) => s.lines);
  /** The order just placed, while the browser is on its way to the payment page. */
  const [leavingFor, setLeavingFor] = useState<string | null>(null);

  // Back from monobank with the browser's Back button (bfcache): the cart is already empty and the
  // order exists — show it instead of a frozen "opening the payment page" screen.
  usePageRestore(() => {
    if (leavingFor) router.replace(href(`/account/orders/${leavingFor}`));
  });

  // Funnel step "started checkout" — also for guests, who are sent to sign in from here: losing
  // people at the login wall is exactly what the funnel should show.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (!hydrated || checkoutTracked.current || lines.length === 0) return;
    checkoutTracked.current = true;
    trackCheckoutStart();
  }, [hydrated, lines.length]);

  // Guests are sent to sign in first and come straight back here.
  useEffect(() => {
    if (session.status === "guest") {
      router.replace(href(`/login?next=${encodeURIComponent(href("/checkout"))}`));
    }
  }, [session.status, router, href]);

  if (!hydrated || session.status !== "authed") {
    return (
      <div className="container-site pt-10">
        <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--muted)]">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("checkout.checkingSession")}
        </p>
      </div>
    );
  }

  if (leavingFor) {
    return (
      <div className="container-site pt-10">
        <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--muted)]" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("checkout.toPayment")}
        </p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container-site pt-10">
        <h1 className="font-display text-[32px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">{t("checkout.title")}</h1>
        <div className="nb hud-frame mt-6 flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] font-medium text-[var(--muted)]">{t("checkout.emptyCart")}</p>
          <Link href={href("/catalog")} className="nb-accent nb-press tap nb-up px-5 py-3 text-[14px]">
            {t("common.toCatalog")}
          </Link>
        </div>
      </div>
    );
  }

  return <CheckoutForm onPlaced={setLeavingFor} />;
}

/** `onPlaced`: the order exists and the cart is emptied — the parent covers the empty-cart state. */
function CheckoutForm({ onPlaced }: { onPlaced: (orderId: string) => void }) {
  const { t, href, locale } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const promoCode = useCart((s) => s.promoCode);
  const setPromoCode = useCart((s) => s.setPromoCode);
  const subtotal = useCartSubtotal();
  const currency = lines[0]?.currency ?? "UAH";
  useCartValidation(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [delivery, setDelivery] = useState<DeliveryMethod>("NOVA_POSHTA");
  const [warehouse, setWarehouse] = useState<NpWarehouse | null>(null);
  const [warehouseFromLast, setWarehouseFromLast] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(false);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [city, setCity] = useState<NpCity | null>(null);
  const queryClient = useQueryClient();
  // The city whose branches are being fetched to frame the map: a late answer for a city the
  // customer has already moved on from must not move the map.
  const framingCity = useRef<string | null>(null);
  /** The customer has touched the city / branch fields or the map — the last-order prefill backs off. */
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

  /** A branch picked in the field or on the map: select it, sync the city, fly to it. */
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
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  const idempotencyKey = useRef(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---- prefill from the last order -----------------------------------------------------------
  const lastOrder = useQuery({
    queryKey: ["me", "last-order"],
    staleTime: Infinity,
    queryFn: async (): Promise<OrderDetail | null> => {
      const list = await api.orders();
      const latest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return latest ? api.order(latest.id) : null;
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
    if (o.deliveryMethod === "PICKUP") {
      setDelivery("PICKUP");
      return;
    }
    // The order keeps only names; find the branch again so it can be submitted with its refs.
    if (o.npCityName && o.npWarehouseName) {
      (async () => {
        try {
          const found = await resolveNpWarehouse(o.npCityName!, o.npWarehouseName!, {
            cities: (q) => api.npCities(q),
            warehouses: (ref) => api.npWarehouses(ref, ""),
          });
          // ...unless the customer has already started picking by hand.
          if (found && !touchedNp.current) {
            setWarehouse(found.warehouse);
            setCity(found.city);
            setWarehouseFromLast(true);
          }
        } catch {
          /* not critical: the customer picks on the map */
        }
      })();
    }
  }, [lastOrder.data]);

  // ---- payment --------------------------------------------------------------------------------
  const paymentQuery = useQuery({ queryKey: ["payment-options", locale], queryFn: () => api.paymentOptions() });
  const paymentOptions = useMemo(() => paymentQuery.data ?? [], [paymentQuery.data]);
  const chosen = paymentOptions.find((p) => p.id === paymentId) ?? null;

  const promo = usePromoPreview(promoCode, subtotal);
  const promoValid = promo.data?.valid === true;
  const discount = promo.discount;
  const total = Math.max(0, subtotal - discount);
  // Every option is paid online through monobank acquiring: either the whole order, or the
  // prepayment now and the rest as cash on delivery (Nova Poshta COD). The server answers with the
  // same amountDueMinor; this one is for the button and the summary.
  const dueNow =
    chosen?.requiresPrepayment && chosen.prepaymentMinor ? Math.min(chosen.prepaymentMinor, total) : total;

  // ---- validation -----------------------------------------------------------------------------
  const nameOk = name.trim().length >= 2;
  const phoneOk = isValidPhone(phone);
  const deliveryOk = delivery === "PICKUP" || !!warehouse;
  const paymentOk = !!paymentId;
  const hasProblems = lines.some((l) => l.stock <= 0);
  const formOk = nameOk && phoneOk && deliveryOk && paymentOk && !hasProblems && subtotal > 0;

  async function submit() {
    setTouched(true);
    setSubmitError(null);
    if (!formOk) {
      setSubmitError(hasProblems ? t("cart.hasProblems") : t("checkout.fixErrors"));
      const firstBad = !nameOk || !phoneOk ? "co-contacts" : !deliveryOk ? "co-delivery" : "co-payment";
      document.getElementById(firstBad)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    const orderable = lines.filter((l) => l.stock > 0);
    const body: CreateOrderRequest = {
      items: orderable.map((l) => ({ productId: l.productId, variantId: l.variantId ?? undefined, quantity: l.quantity })),
      customerName: name.trim(),
      phone: phoneE164(phone),
      comment: comment.trim() || undefined,
      // ONLY a code the server has just confirmed (see UI-FIXES §6).
      promoCode: promoValid ? promoCode.trim() : undefined,
      deliveryMethod: delivery,
      npCityRef: delivery === "NOVA_POSHTA" ? warehouse?.cityRef ?? undefined : undefined,
      npCityName: delivery === "NOVA_POSHTA" ? warehouse?.cityName ?? undefined : undefined,
      npWarehouseRef: delivery === "NOVA_POSHTA" ? warehouse?.ref : undefined,
      npWarehouseName: delivery === "NOVA_POSHTA" ? warehouse?.description : undefined,
      paymentOptionId: paymentId!,
    };
    try {
      // A quantity change still in its debounce must reach the server cart BEFORE the order removes
      // the ordered lines from it — otherwise the late write would put them back.
      await flushCart();
      const created = await api.createOrder(body, idempotencyKey.current);
      trackOrderCreated(created.orderId);
      cartAfterOrder(orderable.map((l) => l.key));
      idempotencyKey.current = newIdempotencyKey();
      onPlaced(created.orderId);
      const orderPage = href(`/account/orders/${created.orderId}`);
      if (created.amountDueMinor <= 0) {
        router.push(orderPage);
        return;
      }
      try {
        await goToPayment(created.orderId, locale);
      } catch (e) {
        // The order is placed either way; its page has the "Pay" button and shows why it failed.
        rememberPaymentError(created.orderId, e instanceof ApiError ? e.message : t("pay.startFailed"));
        router.push(orderPage);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "PROMO_REJECTED") {
        setPromoCode("");
        setSubmitError(t("checkout.promoDropped", { message: e.message }));
      } else {
        setSubmitError(e instanceof ApiError ? e.message : t("checkout.failed"));
      }
      setSubmitting(false);
    }
  }

  const submitLabel = t("checkout.submitPay", { amount: fmt.money(dueNow, currency) });
  // The last order's branch shows as a compact card until "Обрати інше"; a branch picked here keeps
  // the fields and the map open, so it can be changed in place.
  const collapsed = !!warehouse && warehouseFromLast && !editingWarehouse;
  const showMap = delivery === "NOVA_POSHTA" && !collapsed;

  return (
    <div className="container-site pt-8">
      <h1 className="font-display text-[30px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[38px]">{t("checkout.title")}</h1>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10"
      >
        <div className="flex min-w-0 flex-col gap-6">
          {/* contacts */}
          <Section id="co-contacts" n={1} title={t("checkout.contacts")}>
            {prefilled && <p className="mb-3 text-[13px] font-medium text-[var(--ok)]">{t("checkout.prefilled")}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t("checkout.name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                status={touched && !nameOk ? "danger" : nameOk ? "ok" : undefined}
                hint={touched && !nameOk ? t("checkout.nameError") : undefined}
                autoComplete="name"
                name="name"
                aria-invalid={touched && !nameOk}
              />
              <Input
                label={t("checkout.phone")}
                inputMode="tel"
                value={phone ? formatPhone(phone) : ""}
                onFocus={() => {
                  if (!phone) setPhone("+38");
                }}
                onChange={(e) => setPhone(e.target.value)}
                status={touched && !phoneOk ? "danger" : phoneOk ? "ok" : undefined}
                hint={touched && !phoneOk ? t("checkout.phoneError") : undefined}
                autoComplete="tel"
                name="tel"
                aria-invalid={touched && !phoneOk}
              />
            </div>
          </Section>

          {/* delivery */}
          <Section id="co-delivery" n={2} title={t("checkout.delivery")}>
            <div role="tablist" aria-label={t("checkout.delivery")} className="grid grid-cols-2 gap-3">
              <DeliveryTab
                active={delivery === "NOVA_POSHTA"}
                onClick={() => setDelivery("NOVA_POSHTA")}
                icon={<Truck className="h-5 w-5" strokeWidth={2.5} />}
                title={t("checkout.np")}
                subtitle={t("checkout.npSubtitle")}
              />
              <DeliveryTab
                active={delivery === "PICKUP"}
                onClick={() => setDelivery("PICKUP")}
                icon={<Store className="h-5 w-5" strokeWidth={2.5} />}
                title={t("checkout.pickup")}
                subtitle={t("checkout.pickupSubtitle")}
              />
            </div>

            {delivery === "NOVA_POSHTA" && (
              <div className="mt-5 flex flex-col gap-4">
                {warehouse && collapsed && (
                  <div className="flex flex-col gap-3 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)]">
                      <MapPin className="h-5 w-5 text-[var(--accent-hi)]" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-[var(--ink)]">
                        {npLabel(warehouse, t)}
                        {warehouseFromLast && (
                          <span className="ml-2 inline-block rounded-full bg-[var(--surface-3)] px-2 py-0.5 align-middle font-display text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">
                            {t("checkout.lastWarehouse")}
                          </span>
                        )}
                      </p>
                      <p className="text-[13px] font-medium text-[var(--muted)]">
                        {warehouse.cityName ? `${warehouse.cityName}, ` : ""}
                        {warehouse.description}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="surface"
                      size="sm"
                      onClick={() => {
                        setEditingWarehouse(true);
                        const p = npLatLng(warehouse);
                        if (p) setFocus({ key: Date.now(), center: p });
                      }}
                    >
                      {t("checkout.changeWarehouse")}
                    </Button>
                  </div>
                )}
                {showMap && (
                  <>
                    <CitySearch city={city} onCity={chooseCity} />
                    {city && (
                      <WarehouseSearch
                        key={city.ref}
                        city={city}
                        warehouse={warehouse}
                        onWarehouse={chooseWarehouse}
                        label={(w) => npLabel(w, t)}
                      />
                    )}
                    <p className="text-[13px] font-semibold text-[var(--muted)]">{t("checkout.mapHint")}</p>
                    <NpWarehouseMap focus={focus} selected={warehouse} onSelect={chooseWarehouse} />
                    {warehouse && warehouseFromLast && (
                      <Button type="button" variant="surface" size="sm" onClick={() => setEditingWarehouse(false)} className="self-start">
                        {t("common.cancel")}
                      </Button>
                    )}
                  </>
                )}
                {touched && !warehouse && (
                  <p className="text-[13px] font-medium text-[var(--danger)]">{t("checkout.warehouseRequired")}</p>
                )}
              </div>
            )}
            {delivery === "PICKUP" && (
              <p className="mt-5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[14px] font-medium leading-relaxed text-[var(--ink)]">
                {t("checkout.pickupText")}
              </p>
            )}
          </Section>

          {/* payment */}
          <Section id="co-payment" n={3} title={t("checkout.payment")}>
            {paymentQuery.isLoading ? (
              <div className="flex flex-col gap-3">
                <div className="shimmer h-20" />
                <div className="shimmer h-20" />
              </div>
            ) : paymentQuery.isError ? (
              <p className="text-[14px] font-medium text-[var(--danger)]">{t("checkout.paymentError")}</p>
            ) : paymentOptions.length === 0 ? (
              <p className="text-[14px] font-medium text-[var(--muted)]">{t("checkout.paymentNone")}</p>
            ) : (
              <div role="radiogroup" aria-label={t("checkout.payment")} className="flex flex-col gap-3">
                {paymentOptions.map((o) => {
                  const prepay = o.requiresPrepayment && !!o.prepaymentMinor;
                  return (
                    <RadioCard
                      key={o.id}
                      selected={paymentId === o.id}
                      onSelect={() => setPaymentId(o.id)}
                      title={o.title}
                      subtitle={
                        <>
                          {prepay
                            ? t("checkout.pay.prepay", { amount: fmt.money(o.prepaymentMinor, currency) })
                            : t("checkout.pay.full")}
                          {o.description && <span className="mt-0.5 block text-[12px] text-[var(--faint)]">{o.description}</span>}
                        </>
                      }
                      icon={
                        prepay ? <Wallet className="h-5 w-5" strokeWidth={2.5} /> : <CreditCard className="h-5 w-5" strokeWidth={2.5} />
                      }
                    />
                  );
                })}
              </div>
            )}
            {paymentOptions.length > 0 && (
              <div className="mt-4 flex flex-col gap-1.5">
                <PaymentTrust />
                <p className="text-[12px] font-medium text-[var(--faint)]">{t("checkout.pay.deadline")}</p>
              </div>
            )}
            {touched && !paymentOk && (
              <p className="mt-3 text-[13px] font-medium text-[var(--danger)]">{t("checkout.paymentRequired")}</p>
            )}
          </Section>

          {/* promo + comment */}
          <Section n={4} title={`${t("checkout.promo")} · ${t("checkout.comment")}`}>
            <PromoField
              code={promoCode}
              onChange={setPromoCode}
              subtotal={subtotal}
              currency={currency}
              preview={{ data: promo.data, loading: promo.loading }}
            />
            <label className="mt-5 block">
              <span className="eyebrow mb-1.5 block text-[11px]">{t("checkout.comment")}</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("checkout.commentPlaceholder")}
                rows={3}
                maxLength={1000}
                className="w-full resize-y rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
            </label>
          </Section>
        </div>

        {/* summary */}
        <aside className="min-w-0">
          <div className="nb-lg hud-frame flex flex-col gap-4 p-5 lg:sticky lg:top-[140px]">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("checkout.summary")}</h2>
              <Link href={href("/cart")} className="font-display text-[12px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] transition-colors hover:text-[var(--accent-hi)]">
                {t("checkout.edit")}
              </Link>
            </div>
            <ul className="flex max-h-[300px] flex-col gap-3 overflow-y-auto pr-1">
              {lines.map((l) => (
                <li key={l.key} className={`flex items-center gap-3 ${l.stock <= 0 ? "opacity-50" : ""}`}>
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
                    <Image src={l.imageUrl} alt="" size={120} className="h-full w-full" />
                    <span className="absolute bottom-0 right-0 rounded-tl-[var(--r)] bg-[rgba(14,14,16,.85)] px-1.5 font-display text-[10px] font-bold text-[var(--ink)]">
                      ×{l.quantity}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-medium text-[var(--ink)]">{l.title}</span>
                    {l.variantName && <span className="block text-[12px] font-semibold text-[var(--muted)]">{l.variantName}</span>}
                    {l.stock <= 0 && <span className="block text-[12px] font-semibold text-[var(--danger)]">{t("cart.unavailable")}</span>}
                  </span>
                  <span className="shrink-0 font-display text-[14px] font-bold tabular-nums text-[var(--ink)]">{fmt.money(l.priceMinor * l.quantity, l.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-1.5 border-t border-[var(--line)] pt-3 text-[14px]">
              <Row label={t("checkout.sum")} value={fmt.money(subtotal, currency)} />
              {discount > 0 && (
                <Row
                  label={promoCode ? t("checkout.discountWithCode", { code: promoCode }) : t("checkout.discount")}
                  value={`−${fmt.money(discount, currency)}`}
                  tone="ok"
                />
              )}
              <Row label={t("checkout.deliveryCost")} value={t("checkout.deliveryCostValue")} muted />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("checkout.total")}</span>
              <span className="font-display text-[22px] font-bold tabular-nums text-[var(--accent)]">
                {fmt.money(total, currency)}
              </span>
            </div>
            {chosen && dueNow !== total && (
              <div className="-mt-1 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
                <Row label={t("checkout.dueNow")} value={fmt.money(dueNow, currency)} strong />
                <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
                  {t("checkout.rest", { amount: fmt.money(total - dueNow, currency) })}
                </p>
              </div>
            )}
            {promoCode && !promo.loading && promo.data && !promo.data.valid && (
              <p className="text-[12px] font-medium text-[var(--danger)]">
                {t("checkout.promoProblem", { code: promoCode, message: promo.data.message ?? t("promo.notFound") })}
              </p>
            )}
            {submitError && (
              <p role="alert" className="rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_55%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] font-medium text-[var(--danger)]">
                {submitError}
              </p>
            )}
            <Button type="submit" variant="accent" size="lg" fullWidth loading={submitting}>
              {submitLabel}
            </Button>
            <p className="text-center text-[12px] font-medium text-[var(--muted)]">
              {t("checkout.agree")}{" "}
              <Link href={href("/terms")} target="_blank" className="link-ink font-semibold text-[var(--ink)]">
                {t("checkout.agreeLink")}
              </Link>
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Section({ id, n, title, children }: { id?: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="nb p-5 sm:p-6" aria-labelledby={id ? `${id}-h` : undefined}>
      <h2 id={id ? `${id}-h` : undefined} className="mb-4 flex items-center gap-3 text-[18px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">
        <span className="chamfer grid h-8 w-8 shrink-0 place-items-center bg-[var(--accent-soft)] text-[14px] text-[var(--accent-hi)] [--chamfer:6px]">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
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
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-[88px] flex-col items-start gap-1.5 rounded-[var(--r-card)] border p-4 text-left transition-[transform,border-color,background-color] active:scale-[.99] ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)]"
      }`}
    >
      {icon}
      <span className="font-display text-[14px] font-bold uppercase leading-tight tracking-[.06em]">{title}</span>
      <span className="text-[12px] font-medium" style={{ color: active ? "var(--ink)" : "var(--muted)" }}>
        {subtitle}
      </span>
    </button>
  );
}

function Row({
  label,
  value,
  tone,
  muted,
  strong,
}: {
  label: string;
  value: string;
  tone?: "ok";
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`font-medium ${muted ? "text-[var(--muted)]" : "text-[var(--ink)]"}`}>{label}</span>
      <span
        className={`text-right font-display font-semibold tabular-nums ${tone === "ok" ? "text-[var(--ok)]" : muted ? "text-[var(--muted)]" : "text-[var(--ink)]"} ${strong ? "text-[16px] font-bold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
