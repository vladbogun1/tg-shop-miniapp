"use client";

import { Search, UserX } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MOBILE_SORTS, parseMobileSort, type Sorting } from "../../model/table";

export function UsersToolbar({
  search,
  onSearch,
  blockedOnly,
  onToggleBlocked,
  sorting,
  onSorting,
}: {
  search: string;
  onSearch: (v: string) => void;
  blockedOnly: boolean;
  onToggleBlocked: () => void;
  sorting: Sorting;
  onSorting: (s: Sorting) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] p-4">
      <div className="min-w-[200px] flex-1">
        <Input
          
          placeholder="Поиск: имя, @username, ID"
          icon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      {/* A filter toggle, not an action: active = orange tint (no solid fill). */}
      <Button
        variant="surface"
        size="md"
        aria-pressed={blockedOnly}
        className={blockedOnly ? "!border-[var(--accent)] !bg-[var(--accent-soft)] !text-[var(--accent-hi)]" : undefined}
        icon={<UserX className="h-4 w-4" />}
        onClick={onToggleBlocked}
      >
        Заблокировали бота
      </Button>
      {/* Phones have no sortable table headers — sort from here. */}
      <div className="w-full md:hidden">
        <Select<string>
          label="Сортировка"
          value={`${sorting.sortBy}:${sorting.sortDir}`}
          onChange={(v) => onSorting(parseMobileSort(v))}
          options={MOBILE_SORTS}
        />
      </div>
    </div>
  );
}
