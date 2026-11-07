"use client";

import { Button } from "@shop/ui/admin-button";
import type { AdminCategory } from "../../model/types";
import { plural } from "../../model/words";
import { useSetMenuVisibility } from "../../queries";
import { BulkBar } from "../BulkBar";

/** Массовые действия над отмеченными категориями: видимость в меню и перенос. */
export function CategoriesBulkBar({
  chosen,
  onClear,
  onMove,
}: {
  chosen: AdminCategory[];
  onClear: () => void;
  onMove: () => void;
}) {
  const setVisibility = useSetMenuVisibility();
  const visible = chosen.filter((c) => c.showInMenu);
  const hidden = chosen.filter((c) => !c.showInMenu);
  return (
    <BulkBar count={chosen.length} noun={plural(chosen.length, "категория", "категории", "категорий")} onClear={onClear}>
      <Button size="sm" variant="accent" loading={setVisibility.isPending} disabled={hidden.length === 0} onClick={() => setVisibility.mutate({ cats: hidden, show: true })}>
        Показывать в меню
      </Button>
      <Button size="sm" variant="outline" loading={setVisibility.isPending} disabled={visible.length === 0} onClick={() => setVisibility.mutate({ cats: visible, show: false })}>
        Скрыть из меню
      </Button>
      <Button size="sm" variant="outline" onClick={onMove}>
        Переместить в…
      </Button>
    </BulkBar>
  );
}
