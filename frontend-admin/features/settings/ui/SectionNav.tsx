"use client";

/**
 * Список разделов настроек: на ПК — внутреннее меню слева на странице раздела, на обзоре — список
 * в стиле «Настроек» iPhone. Это обычные ссылки: уход с несохранёнными правками спрашивает `useUnsavedGuard`.
 */
import { ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { BLOCK_TITLE, type SectionBlock, type SettingsSection } from "../model/sections";

function byBlock(sections: readonly SettingsSection[]): [SectionBlock, SettingsSection[]][] {
  const blocks: SectionBlock[] = ["shop", "team"];
  return blocks.map((b) => [b, sections.filter((s) => s.block === b)] as [SectionBlock, SettingsSection[]]).filter(([, list]) => list.length > 0);
}

/** Внутреннее меню страницы раздела (только ПК). */
export function SectionNav({ sections, current }: { sections: readonly SettingsSection[]; current: string }) {
  return (
    <nav aria-label="Разделы настроек" className="flex min-w-0 flex-col gap-4">
      {byBlock(sections).map(([block, list]) => (
        <div key={block} className="flex min-w-0 flex-col gap-0.5">
          <div className="field-label !text-[11px] px-3 pb-1 !text-[var(--text-faint)]">{BLOCK_TITLE[block]}</div>
          {list.map((s) => {
            const active = s.id === current;
            const Icon = s.icon;
            return (
              <Link
                key={s.id}
                href={`/settings/${s.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focusable flex min-w-0 items-center gap-2.5 rounded-[var(--r-md)] px-3 py-2 text-[13.5px] transition-colors",
                  active ? "bg-[var(--accent-soft-2)] font-semibold text-[var(--accent-hi)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {s.superOnly && <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" aria-label="Только главному админу" />}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Обзор: разделы с описаниями, сгруппированные по блокам. */
export function SectionList({ sections }: { sections: readonly SettingsSection[] }) {
  return (
    <nav aria-label="Разделы настроек" className="flex min-w-0 flex-col gap-5">
      {byBlock(sections).map(([block, list]) => (
        <section key={block} className="min-w-0">
          <h2 className="field-label mb-2 px-1 !text-[11px] !text-[var(--text-faint)]">{BLOCK_TITLE[block]}</h2>
          <ul className="panel min-w-0 divide-y divide-[var(--line)] overflow-hidden !p-0">
            {list.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.id}>
                  <Link
                    href={`/settings/${s.id}`}
                    className="focusable flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)] pointer-coarse:min-h-14"
                  >
                    <span className="accent-tint grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)]">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-[var(--text)]">{s.title}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--text-muted)]">{s.description}</span>
                    </span>
                    {s.superOnly && <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" aria-label="Только главному админу" />}
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
