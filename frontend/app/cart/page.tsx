"use client";

/**
 * CART — ChiSetup (v3).
 *
 * Graphite line-item cards (thumbnail · title · variant · unit price ·
 * QtyStepper · remove), live subtotal, a promo-code field kept in the cart
 * store, and a STICKY bottom summary bar (total + prominent "Оформить") sitting
 * above the TabBar within thumb reach. Empty-cart state with a CTA back to the
 * catalog. Items animate in directly (NOT via variant-propagation through
 * AnimatePresence — see NEO.md caveat) and animate out on removal.
 *
 * The promo code is checked HERE (PromoField) rather than only on the last checkout step, and
 * the totals below show the discounted amount — the cart used to promise the full price and let
 * the final step reject the code with no way to remove it.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PromoField, usePromoPreview } from "@/components/cart/PromoField";
import { Button } from "@/components/ui/Button";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { useT } from "@/i18n/context";
import { Image } from "@/lib/image";
import { useCart, useCartCount, useCartSubtotal } from "@/lib/cart";
import { maxQty, useOrderLimits } from "@/lib/order-limits";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { haptic } from "@/lib/telegram";
import { useKeyboardOpen } from "@/lib/viewport";

export default function CartPage() {
  const t = useT();
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const limits = useOrderLimits();
  const remove = useCart((s) => s.remove);
  const promoCode = useCart((s) => s.promoCode);
  const setPromoCode = useCart((s) => s.setPromoCode);
  const subtotal = useCartSubtotal();
  const count = useCartCount();
  const promo = usePromoPreview(promoCode, subtotal);
  // While the promo code is being typed the bottom dock is pure obstruction: the tab bar already
  // hides itself, and this bar sat on top of the field and its answer ("промокод не найден").
  const keyboardOpen = useKeyboardOpen();
  const total = Math.max(0, subtotal - promo.discount);

  const empty = lines.length === 0;
  const currency = lines[0]?.currency ?? "UAH";

  // ---- empty state ---------------------------------------------------------
  if (empty) {
    return (
      <div className="pt-2">
        <h1 className="nb-up mb-6 text-[28px] font-extrabold text-[var(--ink)]">
          {t("cart.title")}
        </h1>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb-lg hud-frame mt-6 flex flex-col items-center gap-4 px-6 py-16 text-center"
        >
          <span className="grid h-16 w-16 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)]">
            <ShoppingCart className="h-7 w-7 text-[var(--accent)]" strokeWidth={2.25} />
          </span>
          <h2 className="nb-up text-[18px] font-extrabold text-[var(--ink)]">
            {t("cart.empty.title")}
          </h2>
          <p className="max-w-[260px] text-[13px] leading-relaxed text-[var(--muted)]">
            {t("cart.empty.text")}
          </p>
          <Link href="/" className="mt-1">
            <Button variant="accent" icon={<ArrowRight className="h-4 w-4" strokeWidth={2.5} />}>
              {t("common.toCatalog")}
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  // ---- filled cart ---------------------------------------------------------
  return (
    <div className="pt-2">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="nb-up text-[28px] font-extrabold text-[var(--ink)]">
          {t("cart.title")}
        </h1>
        <span className="nb-up rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
          {t("cart.itemCount", { n: count })}
        </span>
      </div>

      {/* line items — animate each item DIRECTLY (NEO.md caveat) */}
      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {lines.map((l, i) => (
            <motion.div
              key={l.key}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0, transition: { ...spring, delay: i * 0.05 } }}
              exit={{ opacity: 0, x: -28, transition: { duration: 0.18 } }}
              className="nb flex gap-3 p-3"
            >
              <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
                <Image
                  src={l.imageUrl}
                  alt={l.title}
                  size={240}
                  className="h-full w-full"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--ink)]">
                      {l.title}
                    </h3>
                    {l.variantName && (
                      <span className="font-display mt-1 inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
                        {l.variantName}
                      </span>
                    )}
                    <div className="mt-1 text-[11px] font-medium text-[var(--faint)]">
                      {money(l.priceMinor, l.currency)} {t("common.currencyPerItem")}
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    aria-label={t("cart.remove")}
                    whileTap={{ scale: 0.88 }}
                    onClick={() => {
                      haptic();
                      remove(l.key);
                    }}
                    className="tap -mr-1.5 -mt-2 grid h-9 w-9 min-h-0 min-w-0 place-items-center rounded-[var(--r)] text-[var(--faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                  </motion.button>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <QtyStepper
                    size="sm"
                    value={l.quantity}
                    min={1}
                    max={maxQty(l.stock, limits)}
                    onChange={(n) => setQty(l.key, n)}
                  />
                  <span className="font-display text-[16px] font-bold tabular-nums text-[var(--ink)]">
                    {money(l.priceMinor * l.quantity, l.currency)}
                  </span>
                </div>
                {limits && limits.maxQtyPerProduct > 0 && limits.maxQtyPerProduct < l.stock && l.quantity >= limits.maxQtyPerProduct && (
                  <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">
                    {t("cart.qtyLimit", { n: limits.maxQtyPerProduct })}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <PromoField
        code={promoCode}
        onChange={setPromoCode}
        subtotal={subtotal}
        currency={currency}
        preview={promo}
      />

      {/* totals card */}
      <div className="nb hud-frame mt-5 p-4">
        <Row label={t("cart.rowItems")} value={money(subtotal, currency)} />
        {promo.discount > 0 && (
          <div className="mt-2">
            <Row
              label={
                promoCode.trim()
                  ? t("cart.rowDiscountWithCode", { code: promoCode.trim() })
                  : t("cart.rowDiscount")
              }
              value={`−${money(promo.discount, currency)}`}
            />
          </div>
        )}
        <div className="my-3 h-px bg-[var(--line)]" />
        <Row label={t("cart.total")} value={money(total, currency)} strong />
      </div>

      {/* spacer so content never hides behind the sticky bar */}
      <div aria-hidden className="h-24" />

      {/* Bottom summary bar, docked above the tab bar (`--tabbar-h`, which goes to 0 when the tab
          bar hides itself). Fixed rather than sticky so the "Оформить" button is always in reach,
          not only once the list is long enough to scroll. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-30 mx-auto w-full max-w-[480px]"
        style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 12px)" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: keyboardOpen ? 0 : 1, y: keyboardOpen ? 24 : 0 }}
          style={{ pointerEvents: keyboardOpen ? "none" : "auto" }}
          transition={spring}
          className="nb-lg mx-4 flex items-center gap-3 rounded-[16px] border-[var(--line-strong)] p-3 pl-4"
        >
          <div className="min-w-0">
            <div className="eyebrow !text-[10px] !tracking-[0.2em]">
              {t("cart.total")}
            </div>
            <div className="font-display whitespace-nowrap text-[20px] font-bold tabular-nums leading-tight text-[var(--accent)]">
              {money(total, currency)}
            </div>
          </div>
          <Button
            variant="accent"
            fullWidth
            className="flex-1"
            icon={<ArrowRight className="h-4 w-4" strokeWidth={2.5} />}
            onClick={() => {
              haptic();
              router.push("/checkout");
            }}
          >
            {t("cart.checkout")}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={
          strong
            ? "nb-up text-[15px] font-bold text-[var(--ink)]"
            : "text-[14px] text-[var(--muted)]"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "font-display text-[20px] font-bold tabular-nums text-[var(--accent)]"
            : "font-display text-[14px] font-semibold tabular-nums text-[var(--ink)]"
        }
      >
        {value}
      </span>
    </div>
  );
}
