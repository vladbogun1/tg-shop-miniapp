"use client";

/** Cart line list + totals, shared by the drawer and the /cart page. */
import { AlertTriangle, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { useI18n } from "@/i18n/context";
import { useCart, type CartLine } from "@/lib/cart";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

export function CartLines({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const lines = useCart((s) => s.lines);
  return (
    <ul className="flex flex-col gap-3">
      {lines.map((l) => (
        <CartRow key={l.key} line={l} onNavigate={onNavigate} compact={compact} />
      ))}
    </ul>
  );
}

function CartRow({ line, onNavigate, compact }: { line: CartLine; onNavigate?: () => void; compact: boolean }) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const unavailable = line.stock <= 0;
  const productHref = href(`/product/${line.slug ?? line.productId}`);
  const size = compact ? "h-20 w-20" : "h-24 w-24";

  return (
    <li
      className={`flex gap-3 rounded-[var(--r-card)] border bg-[var(--surface)] p-3 ${
        unavailable ? "border-[color-mix(in_srgb,var(--danger)_55%,transparent)]" : "border-[var(--line)]"
      }`}
    >
      <Link href={productHref} onClick={onNavigate} className={`${size} shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]`}>
        <Image src={line.imageUrl} alt={line.title} size={200} className="h-full w-full" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <Link
            href={productHref}
            onClick={onNavigate}
            className="line-clamp-2 min-w-0 flex-1 text-[14px] font-semibold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-hi)]"
          >
            {line.title}
          </Link>
          <button
            type="button"
            onClick={() => remove(line.key)}
            aria-label={t("cart.remove", { title: line.title })}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
        {line.variantName && <p className="text-[12px] font-medium text-[var(--muted)]">{line.variantName}</p>}
        {unavailable ? (
          <p className="flex items-center gap-1 text-[12px] font-semibold text-[var(--danger)]">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} /> {t("cart.unavailable")}
          </p>
        ) : (
          line.previousPriceMinor != null &&
          line.previousPriceMinor !== line.priceMinor && (
            <p className="text-[12px] font-semibold text-[var(--warn)]">
              {t("cart.priceChanged", { old: fmt.money(line.previousPriceMinor, line.currency) })}
            </p>
          )
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          {!unavailable ? (
            <QtyStepper
              size="sm"
              value={line.quantity}
              min={1}
              max={Math.max(1, line.stock)}
              onChange={(n) => setQty(line.key, n)}
            />
          ) : (
            <span />
          )}
          <span className="font-display text-[16px] font-bold tabular-nums text-[var(--ink)]">
            {fmt.money(line.priceMinor * line.quantity, line.currency)}
          </span>
        </div>
      </div>
    </li>
  );
}

export function CartEmpty({ onNavigate }: { onNavigate?: () => void }) {
  const { t, href } = useI18n();
  return (
    <div className="hud-frame m-1 flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="chamfer grid h-16 w-16 place-items-center bg-[var(--surface-2)]">
        <ShoppingBag className="h-8 w-8 text-[var(--accent)]" strokeWidth={1.75} />
      </span>
      <p className="font-display text-[18px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">{t("cart.empty.title")}</p>
      <p className="max-w-xs text-[14px] font-medium text-[var(--muted)]">{t("cart.empty.text")}</p>
      <Link
        href={href("/catalog")}
        onClick={onNavigate}
        className="nb-accent nb-press tap nb-up mt-2 inline-flex items-center px-5 py-3 text-[14px]"
      >
        {t("common.toCatalog")}
      </Link>
    </div>
  );
}
