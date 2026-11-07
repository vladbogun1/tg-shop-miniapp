"use client";

/**
 * «Хотят купить» на главной заказов: чип с числом товаров, которых ждут; по нажатию — топ-5 товаров по числу
 * ждущих (окошко под чипом, на телефоне — нижняя шторка) и ссылка на «Чего ждут».
 * Пусто/ошибка — не показываем (чипа нет). Раньше это был отдельный блок в 135px над доской.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { useMediaQuery } from "@shop/ui/use-media";
import { lineTitle } from "../model/batch";
import { peopleOfRows } from "../model/demand";
import type { Demand } from "../model/types";
import { useDemand } from "../queries";

interface Top {
  productId: string;
  title: string;
  imageUrl: string | null;
  people: number;
  units: number;
  stock: number;
}

const DEMAND_HREF = "/preorders?tab=demand";

function topWanted(rows: Demand[] | undefined): { top: Top[]; products: number } {
  const by = new Map<string, Demand[]>();
  for (const d of rows ?? []) by.set(d.productId, [...(by.get(d.productId) ?? []), d]);
  const all = [...by.values()].map((r) => ({
    productId: r[0].productId,
    // у товара с вариантами показываем название товара, у одиночной строки — как есть
    title: r.length > 1 ? r[0].title : lineTitle(r[0].title, r[0].variantName),
    imageUrl: r[0].imageUrl,
    people: peopleOfRows(r),
    units: r.reduce((n, d) => n + d.units, 0),
    stock: r.reduce((n, d) => n + d.stock, 0),
  }));
  all.sort((a, b) => b.people - a.people || b.units - a.units);
  // The chip counts products, not people: one person waiting for two products would be counted twice.
  return { top: all.slice(0, 5), products: all.length };
}

function Rows({ top, onNavigate }: { top: Top[]; onNavigate: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {top.map((t) => (
        <Link key={t.productId} href={DEMAND_HREF} onClick={onNavigate} className="card-2 card-hover flex min-w-0 items-center gap-2.5 p-2">
          <Image src={t.imageUrl} alt={t.title} size={80} className="h-10 w-10 shrink-0 rounded-[var(--r-md)] border border-[var(--line)]" />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 break-words text-[12.5px] font-semibold leading-snug text-[var(--text)]">{t.title}</div>
            <div className="tabular text-[12px] text-[var(--accent-hi)]">
              {t.people} чел / {t.units} шт
              <span className="text-[var(--text-faint)]"> · на складе {t.stock}</span>
            </div>
          </div>
        </Link>
      ))}
      <Link href={DEMAND_HREF} onClick={onNavigate} className="mt-0.5 inline-flex items-center justify-end gap-0.5 text-[12.5px] font-semibold text-[var(--accent-hi)] hover:underline">
        Все <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function WantedWidget({ chipClass }: { chipClass: string }) {
  const q = useDemand();
  const { top, products } = useMemo(() => topWanted(q.data), [q.data]);
  const wide = useMediaQuery("(min-width: 768px)", true);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Popover: closes on a press outside and on Esc (the phone sheet has its own overlay layer).
  useEffect(() => {
    if (!open || !wide) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, wide]);

  if (top.length === 0) return null;
  const close = () => setOpen(false);
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" title={`Ждут ${products} товаров`} className={chipClass}>
        <BellRing className="h-3.5 w-3.5 shrink-0 text-[var(--accent-hi)]" />
        <span className="font-display text-[11px] uppercase tracking-[0.06em]">Хотят купить</span>
        <span className="tabular text-[13px] font-bold text-[var(--text)]">{products}</span>
      </button>
      {wide ? (
        open && (
          <div role="dialog" aria-label="Хотят купить" className={cn("elevated absolute left-0 top-[calc(100%+6px)] z-40 w-[340px] max-w-[calc(100vw-32px)] p-2.5")}>
            <Rows top={top} onNavigate={close} />
          </div>
        )
      ) : (
        <ActionSheet open={open} title="Хотят купить" onClose={close}>
          <div className="mb-1">
            <Rows top={top} onNavigate={close} />
          </div>
        </ActionSheet>
      )}
    </div>
  );
}
