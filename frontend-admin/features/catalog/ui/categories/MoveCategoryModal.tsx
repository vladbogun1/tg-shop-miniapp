"use client";

import { FolderInput } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { Select } from "@/components/ui/Select";
import { moveOptions } from "../../model/tree-view";
import type { AdminCategory } from "../../model/types";

/** «Переместить в…»: другой корень (без собственных товаров) или верхний уровень. */
export function MoveCategoryModal({
  moving,
  categories,
  onClose,
  onMove,
}: {
  moving: AdminCategory | null;
  categories: AdminCategory[];
  onClose: () => void;
  onMove: (moving: AdminCategory, parentId: string | null) => void;
}) {
  const [moveTarget, setMoveTarget] = useState("");
  const options = useMemo(() => moveOptions(categories, moving), [categories, moving]);
  useEffect(() => setMoveTarget(""), [moving]);
  return (
    <Modal
      open={!!moving}
      onClose={onClose}
      size="sm"
      title={`Переместить «${moving?.name ?? ""}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="accent"
            icon={<FolderInput className="h-4 w-4" />}
            disabled={options.length === 0 || (moveTarget === "" && !options.some((o) => o.value === ""))}
            onClick={() => moving && onMove(moving, moveTarget || null)}
          >
            Переместить
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <p className="text-[14px] text-[var(--text-muted)]">
          Некуда перемещать: подходящих корневых категорий нет (в корень с товарами подкатегорию положить нельзя).
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Select label="Куда" value={moveTarget} onChange={setMoveTarget} options={options} placeholder="Выберите родителя…" />
          <p className="text-[12px] leading-relaxed text-[var(--text-faint)]">
            Товары и адрес /catalog/{moving?.slug} не меняются. Характеристики нового родителя добавятся к её собственным.
            Корневые категории, в которых лежат товары, родителем стать не могут.
          </p>
        </div>
      )}
    </Modal>
  );
}
