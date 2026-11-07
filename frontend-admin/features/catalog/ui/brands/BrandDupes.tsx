"use client";

import { GitMerge } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { dupeSignature } from "../../model/brand-dupes";
import type { AdminBrand } from "../../model/types";
import { productsWord } from "../../model/words";

/**
 * Плашка «Возможные дубликаты»: группы брендов с одинаковым названием или алиасом после нормализации
 * («Attack Shark» / «AttackShark»). «Объединить группу» открывает слияние с выбором главного,
 * «Не дубликаты» прячет группу (запоминается в браузере).
 */
export function BrandDupes({
  groups,
  onMerge,
  onDismiss,
}: {
  groups: AdminBrand[][];
  onMerge: (group: AdminBrand[]) => void;
  onDismiss: (signature: string) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <section
      aria-label="Возможные дубликаты брендов"
      className="mb-4 rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--warn)_40%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] p-3"
    >
      <h2 className="mb-2 text-[13px] font-semibold text-[var(--text)]">
        Возможные дубликаты: <span className="tabular">{groups.length}</span>
        <span className="ml-2 font-normal text-[var(--text-muted)]">Проверьте глазами — совпадение считается по написанию без пробелов и знаков.</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {groups.slice(0, 5).map((g) => (
          <li key={dupeSignature(g.map((b) => b.id))} className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1 text-[13px] text-[var(--text)]">
              {g.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && <span className="text-[var(--text-faint)]"> · </span>}
                  <b>{b.name}</b> <span className="text-[var(--text-faint)]">{productsWord(b.productCount)}</span>
                </span>
              ))}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="accent" icon={<GitMerge className="h-3.5 w-3.5" />} onClick={() => onMerge(g)}>
                Объединить группу
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDismiss(dupeSignature(g.map((b) => b.id)))}>
                Не дубликаты
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {groups.length > 5 && <p className="mt-2 text-[12px] text-[var(--text-faint)]">И ещё {groups.length - 5} — фильтр «Возможные дубликаты» покажет все.</p>}
    </section>
  );
}
