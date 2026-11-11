"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";

export interface GroupChip {
  id: string;
  title: string;
}

/** Поиск по настройкам и переходы к группам (чипы листаются вбок; страница при этом не скроллится). */
export function SettingsToolbar({
  query,
  onQuery,
  groups,
}: {
  query: string;
  onQuery: (q: string) => void;
  groups: GroupChip[];
}) {
  return (
    <div className="mb-4 flex min-w-0 flex-col gap-2">
      <div className="max-w-[420px]">
        <Input aria-label="Поиск по настройкам" placeholder="Найти настройку" value={query} onChange={(e) => onQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
      </div>
      {groups.length > 1 && (
        <nav
          aria-label="Группы настроек"
          className="thin-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(to_right,#000_85%,transparent)] md:flex-wrap md:overflow-visible md:[mask-image:none]"
        >
          {groups.map((g) => (
            <a
              key={g.id}
              href={`#group-${g.id}`}
              className="focusable chip-tint nb-press shrink-0 !bg-[var(--surface-3)] pointer-coarse:min-h-11 pointer-coarse:items-center"
            >
              {g.title}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
