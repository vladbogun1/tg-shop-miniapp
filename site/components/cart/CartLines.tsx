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
      className={`flex gap-3 rounded-[var(--r)] border-[3px] bg-[var(--surface)] p-3 ${
        unavailable ? "border-[var(--danger)]" : "border-[var(--line)]"
      }`}
    >
      <Link href={productHref} onClick={onNavigate} className={`${size} shrink-0 overflow-hidden rounded-[var(--r)] border-[2.5px] border-[var(--line)]`}>
        <Image src={line.imageUrl} alt={line.title} size={200} className="h-full w-full" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <Link
            href={productHref}
            onClick={onNavigate}
            className="line-clamp-2 min-w-0 flex-1 text-[14px] font-bold leading-snug text-[var(--ink)] hover:underline"
          >
            {line.title}
          </Link>
          <button
            type="button"
            onClick={() => remove(line.key)}
            aria-label={t("cart.remove", { title: line.title })}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] text-[var(--muted)] hover:bg-[var(--danger)] hover:text-white"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
        {line.variantName && <p className="text-[12px] font-bold text-[var(--muted)]">{line.variantName}</p>}
        {unavailable ? (
          <p className="flex items-center gap-1 text-[12px] font-extrabold text-[var(--danger)]">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={3} /> {t("cart.unavailable")}
          </p>
        ) : (
          line.previousPriceMinor != null &&
          line.previousPriceMinor !== line.priceMinor && (
            <p className="text-[12px] font-bold text-[var(--warn)]">
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
          <span className="text-[16px] font-black text-[var(--ink)]">
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
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--c3)] shadow-[4px_4px_0_var(--shadow)]">
        <ShoppingBag className="h-8 w-8 text-[var(--accent-ink)]" strokeWidth={2.5} />
      </span>
      <p className="text-[18px] font-black uppercase text-[var(--ink)]">{t("cart.empty.title")}</p>
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
