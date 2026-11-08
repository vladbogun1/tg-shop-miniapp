"use client";

/** «⋯» строки «Команды»: общий `ActionMenu`; у своей строки вместо меню — ссылка «Мой аккаунт». */
import Link from "next/link";
import { ActionMenu, type MenuItem } from "@/components/ui/ActionMenu";
import { adminName, inviteName } from "../model/roles";
import type { TeamRow } from "../model/team-rows";

export type { MenuItem };

export function RowMenu({ row, itemsFor }: { row: TeamRow; itemsFor: (row: TeamRow) => MenuItem[] }) {
  if (row.type === "admin" && row.admin.self) {
    return (
      <Link href="/account" className="hit whitespace-nowrap text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
        Мой аккаунт
      </Link>
    );
  }
  const title = row.type === "admin" ? adminName(row.admin) : inviteName(row.invite);
  return <ActionMenu title={title} items={itemsFor(row)} label={`Действия: ${title}`} />;
}
