"use client";

import type { ReactNode } from "react";

/** Блок страницы поставки: заголовок, необязательная подсказка, содержимое. `id` — для быстрых ссылок наверху. */
export function BatchSection({ id, title, hint, className, children }: { id: string; title: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={"mb-7 min-w-0 scroll-mt-20 " + (className ?? "")}>
      <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.05em] text-[var(--ink)]">{title}</h2>
      {hint && <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Быстрые ссылки на блоки — на длинной странице, чтобы не листать. */
export function BatchJumps({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav className="thin-scroll -mx-1 mb-5 flex lg:hidden gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Блоки поставки">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          className="whitespace-nowrap rounded-full border border-[var(--line)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
