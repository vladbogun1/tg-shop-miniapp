"use client";

/**
 * CART (design doc §6bis.1 step 1): glass line items with quantity steppers,
 * promo-code input, totals, and "Оформить заказ" → /checkout.
 * Cart state is the persisted zustand store (lib/cart.ts).
 */
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassButton } from "@/components/ui/GlassButton";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Image } from "@/lib/image";
import { useCart, useCartSubtotal } from "@/lib/cart";
import { money } from "@/lib/money";
import { useMainButton } from "@/lib/telegram";

export default function CartPage() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const promoCode = useCart((s) => s.promoCode);
  const setPromoCode = useCart((s) => s.setPromoCode);
  const subtotal = useCartSubtotal();

  const empty = lines.length === 0;
  const currency = lines[0]?.currency ?? "UAH";

  useMainButton({
    text: `Оформить · ${money(subtotal, currency)}`,
    onClick: () => router.push("/checkout"),
    visible: !empty,
  });

  if (empty) {
    return (
      <div className="pt-2">
        <h1 className="mb-6 text-[26px] font-bold tracking-tight text-[var(--text)]">
          Корзина
        </h1>
        <div className="glass mt-6 flex flex-col items-center gap-3 rounded-[var(--r-lg)] px-6 py-14 text-center">
          <ShoppingCart className="h-9 w-9 text-[var(--text-muted)]" />
          <h2 className="text-[17px] font-semibold text-[var(--text)]">
            Корзина пуста
          </h2>
          <p className="max-w-[260px] text-[13px] text-[var(--text-muted)]">
            Добавьте товары из каталога, и они появятся здесь.
          </p>
          <Link href="/">
            <GlassButton variant="accent">В каталог</GlassButton>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <h1 className="mb-4 text-[26px] font-bold tracking-tight text-[var(--text)]">
        Корзина
      </h1>

      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {lines.map((l) => (
            <motion.div
              key={l.key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              className="glass flex gap-3 rounded-[var(--r-md)] p-3"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--r-sm)]">
                <Image src={l.imageUrl} alt={l.title} size={200} className="h-full w-full" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-[14px] font-semibold text-[var(--text)]">
                    {l.title}
                  </h3>
                  <button
                    type="button"
                    aria-label="Удалить"
                    onClick={() => remove(l.key)}
                    className="tap -mr-1 -mt-1 flex h-8 w-8 min-h-0 min-w-0 items-center justify-center rounded-full text-[var(--text-faint)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {l.variantName && (
                  <span className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                    {l.variantName}
                  </span>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <QtyStepper
                    size="sm"
                    value={l.quantity}
                    min={1}
                    max={l.stock}
                    onChange={(n) => setQty(l.key, n)}
                  />
                  <span className="text-[15px] font-bold text-[var(--accent)]">
                    {money(l.priceMinor * l.quantity, l.currency)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* promo */}
      <div className="glass mt-4 flex items-center gap-2 rounded-[var(--r-md)] px-3 py-2">
        <input
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          placeholder="Промокод"
          className="tap w-full bg-transparent px-1 text-[15px] uppercase text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] placeholder:normal-case"
        />
      </div>
      <p className="mt-1 px-1 text-[12px] text-[var(--text-faint)]">
        Скидка по промокоду применится при оформлении.
      </p>

      {/* totals */}
      <div className="glass mt-4 rounded-[var(--r-md)] p-4">
        <Row label="Товары" value={money(subtotal, currency)} />
        <div className="my-3 h-px bg-white/10" />
        <Row label="Итого" value={money(subtotal, currency)} strong />
      </div>

      <div className="mt-4">
        <GlassButton variant="accent" fullWidth onClick={() => router.push("/checkout")}>
          Оформить заказ · {money(subtotal, currency)}
        </GlassButton>
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
            ? "text-[16px] font-semibold text-[var(--text)]"
            : "text-[14px] text-[var(--text-muted)]"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "text-[18px] font-bold text-[var(--accent)]"
            : "text-[14px] text-[var(--text)]"
        }
      >
        {value}
      </span>
    </div>
  );
}
