"use client";

/** «Хотят купить» на главной: топ-5 товаров по числу ждущих людей; ссылка на «Чего ждут». Пусто/ошибка — не показываем. */
import { useMemo } from "react";
import { BellRing, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Image } from "@/lib/image";
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

export function WantedWidget() {
  const q = useDemand();
  const top = useMemo<Top[]>(() => {
    const by = new Map<string, Demand[]>();
    for (const d of q.data ?? []) by.set(d.productId, [...(by.get(d.productId) ?? []), d]);
    return [...by.values()]
      .map((rows) => ({
        productId: rows[0].productId,
        // у товара с вариантами показываем название товара, у одиночной строки — как есть
        title: rows.length > 1 ? rows[0].title : lineTitle(rows[0].title, rows[0].variantName),
        imageUrl: rows[0].imageUrl,
        people: peopleOfRows(rows),
        units: rows.reduce((n, d) => n + d.units, 0),
        stock: rows.reduce((n, d) => n + d.stock, 0),
      }))
      .sort((a, b) => b.people - a.people || b.units - a.units)
      .slice(0, 5);
  }, [q.data]);

  if (top.length === 0) return null;
  return (
    <section className="card mb-4 min-w-0 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-[var(--accent-hi)]" />
        <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Хотят купить</h2>
        <Link href="/preorders?tab=demand" className="ml-auto inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-[var(--accent-hi)] hover:underline">
          Все <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid min-w-0 gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
        {top.map((t) => (
          <Link key={t.productId} href="/preorders?tab=demand" className="card-2 card-hover flex min-w-0 items-center gap-2.5 p-2">
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
      </div>
    </section>
  );
}
