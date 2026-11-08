"use client";

/** «⋯» строки промокода: общий `ActionMenu` (список на ноутбуке, шторка на телефоне). */
import { ActionMenu, type MenuItem } from "@/components/ui/ActionMenu";

export type { MenuItem };

export function RowMenu({ title, items }: { title: string; items: MenuItem[] }) {
  return <ActionMenu title={title} items={items} label={`Действия: ${title}`} />;
}
