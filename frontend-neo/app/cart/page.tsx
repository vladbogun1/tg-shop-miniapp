"use client";

/**
 * CART — NEO-BRUTALISM restyle.
 *
 * Bold bordered line-item cards (thumbnail · title · variant · unit price ·
 * QtyStepper · remove), live subtotal, a promo-code field kept in the cart
 * store, and a STICKY bottom summary bar (total + prominent "Оформить") sitting
 * above the TabBar within thumb reach. Empty-cart state with a CTA back to the
 * catalog. Items animate in directly (NOT via variant-propagation through
 * AnimatePresence — see NEO.md caveat) and animate out on removal.
 *
 * Behaviour is unchanged vs the original: same cart store, same navigation to
 * /checkout, same useMainButton call, same promo handling. Look & layout only.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassButton } from "@/components/ui/GlassButton";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Image } from "@/lib/image";
import { useCart, useCartCount, useCartSubtotal } from "@/lib/cart";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { haptic, useMainButton } from "@/lib/telegram";

export default function CartPage() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const promoCode = useCart((s) => s.promoCode);
  const setPromoCode = useCart((s) => s.setPromoCode);
  const subtotal = useCartSubtotal();
  const count = useCartCount();

  const empty = lines.length === 0;
  const currency = lines[0]?.currency ?? "UAH";

  useMainButton({
    text: `Оформить · ${money(subtotal, currency)}`,
    onClick: () => router.push("/checkout"),
    visible: !empty,
  });

  // ---- empty state ---------------------------------------------------------
  if (empty) {
    return (
      <div className="pt-2">
        <h1 className="nb-up mb-6 text-[30px] font-black text-[var(--ink)]">
          Корзина
        </h1>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb-lg mt-6 flex flex-col items-center gap-4 px-6 py-16 text-center"
        >
          <span
            className="grid h-16 w-16 -rotate-2 place-items-center border-[3px] border-[var(--line)] shadow-[4px_4px_0_var(--shadow)]"
            style={{ background: "var(--c3)" }}
          >
            <ShoppingCart className="h-7 w-7 text-[var(--ink)]" strokeWidth={2.75} />
          </span>
          <h2 className="nb-up text-[18px] font-black text-[var(--ink)]">
            Корзина пуста
          </h2>
          <p className="max-w-[260px] text-[13px] font-medium leading-relaxed text-[var(--muted)]">
            Добавьте товары из каталога — и они появятся здесь.
          </p>
          <Link href="/" className="mt-1">
            <GlassButton variant="accent" icon={<ArrowRight className="h-4 w-4" strokeWidth={2.75} />}>
              В каталог
            </GlassButton>
          </Link>
        </motion.div>
      </div>
    );
  }

  // ---- filled cart ---------------------------------------------------------
  return (
    <div className="pt-2">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="nb-up text-[30px] font-black text-[var(--ink)]">
          Корзина
        </h1>
        <span className="nb-up border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[12px] font-black text-[var(--ink)]">
          {count} {plural(count, "товар", "товара", "товаров")}
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
              <div className="h-[88px] w-[88px] shrink-0 overflow-hidden border-[2.5px] border-[var(--line)]">
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
                    <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-[var(--ink)]">
                      {l.title}
                    </h3>
                    {l.variantName && (
                      <span className="nb-up mt-1 inline-flex border-[2px] border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-black text-[var(--ink)]">
                        {l.variantName}
                      </span>
                    )}
                    <div className="mt-1 text-[11px] font-semibold text-[var(--faint)]">
                      {money(l.priceMinor, l.currency)} / шт
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    aria-label="Удалить"
                    whileTap={{ scale: 0.88 }}
                    onClick={() => {
                      haptic();
                      remove(l.key);
                    }}
                    className="tap -mr-1 -mt-1 grid h-9 w-9 min-h-0 min-w-0 place-items-center border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px]"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.75} />
                  </motion.button>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <QtyStepper
                    size="sm"
                    value={l.quantity}
                    min={1}
                    max={l.stock}
                    onChange={(n) => setQty(l.key, n)}
                  />
                  <span className="border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[15px] font-black text-[var(--ink)]">
                    {money(l.priceMinor * l.quantity, l.currency)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* promo */}
      <div className="nb mt-4 flex items-center gap-2 px-4 py-3">
        <span className="text-[16px]" aria-hidden>
          🎟️
        </span>
        <input
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          placeholder="Промокод"
          className="tap min-h-0 w-full bg-transparent text-[15px] font-bold uppercase tracking-wide text-[var(--ink)] outline-none placeholder:font-semibold placeholder:text-[var(--faint)] placeholder:normal-case placeholder:tracking-normal"
        />
      </div>
      <p className="mt-1.5 px-1 text-[12px] font-medium text-[var(--faint)]">
        Скидка по промокоду применится при оформлении.
      </p>

      {/* totals card */}
      <div className="nb mt-4 p-4">
        <Row label="Товары" value={money(subtotal, currency)} />
        <div className="my-3 h-[2.5px] bg-[var(--line)]" />
        <Row label="Итого" value={money(subtotal, currency)} strong />
      </div>

      {/* spacer so content never hides behind the sticky bar */}
      <div aria-hidden className="h-24" />

      {/* STICKY bottom summary bar (above the TabBar) */}
      <div
        className="pointer-events-none sticky z-30 -mx-4"
        style={{ bottom: "calc(84px + var(--safe-bottom))" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb-lg pointer-events-auto mx-4 flex items-center gap-3 p-3 pl-4"
        >
          <div className="min-w-0">
            <div className="nb-up text-[11px] font-black text-[var(--faint)]">
              Итого
            </div>
            <div className="text-[20px] font-black leading-tight text-[var(--ink)]">
              {money(subtotal, currency)}
            </div>
          </div>
          <GlassButton
            variant="accent"
            fullWidth
            className="flex-1"
            icon={<ArrowRight className="h-4 w-4" strokeWidth={2.75} />}
            onClick={() => {
              haptic();
              router.push("/checkout");
            }}
          >
            Оформить
          </GlassButton>
        </motion.div>
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
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
            ? "nb-up text-[15px] font-black text-[var(--ink)]"
            : "text-[14px] font-semibold text-[var(--muted)]"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[16px] font-black text-[var(--ink)]"
            : "text-[14px] font-bold text-[var(--ink)]"
        }
      >
        {value}
      </span>
    </div>
  );
}
