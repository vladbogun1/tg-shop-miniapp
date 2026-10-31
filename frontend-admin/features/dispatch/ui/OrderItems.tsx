import type { AdminDispatchOrder } from "@/features/order";
import { Image, resolveImageFull } from "@/lib/image";
import { Package } from "lucide-react";

/** Items — with the photo: packing goes by the picture, the text alone was hard to match at the post office. */
export function OrderItems({ items, onZoom }: { items: AdminDispatchOrder["items"]; onZoom: (src: string) => void }) {
  return (
    <div>
      <div className="field-label mb-1.5">Товары</div>
      <ul className="flex flex-col gap-2">
        {items.map((it, idx) => (
          <li key={idx} className="flex items-center gap-3">
            {it.imageUrl ? (
              <button
                type="button"
                onClick={() => onZoom(resolveImageFull(it.imageUrl!))}
                className="nb-press shrink-0 rounded-[var(--r-md)]"
                aria-label={`Фото: ${it.title}`}
              >
                <Image
                  src={it.imageUrl}
                  alt={it.title}
                  size={160}
                  className="h-16 w-16 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]"
                />
              </button>
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-faint)]">
                <Package className="h-6 w-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 break-words text-[14px] font-medium leading-snug text-[var(--text)]" title={it.title}>
                {it.title}
              </div>
              {it.variantName && <div className="truncate text-[12.5px] text-[var(--text-muted)]">{it.variantName}</div>}
            </div>
            <span className="font-display tabular shrink-0 text-[18px] font-bold text-[var(--accent-hi)]">×{it.quantity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
