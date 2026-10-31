"use client";

import { GitMerge } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import type { AdminBrand } from "../../model/types";
import { productsWord } from "../../model/words";
import { useMergeBrand } from "../../queries";
import { BrandCombobox, type BrandValue } from "../BrandCombobox";

const NO_TARGET: BrandValue = { id: null, name: "" };

/** «Объединить с…»: товары и алиасы переходят к выбранному бренду, этот удаляется. */
export function MergeBrandModal({
  merging,
  brands,
  onClose,
}: {
  merging: AdminBrand | null;
  brands: AdminBrand[];
  onClose: () => void;
}) {
  const [target, setTarget] = useState<BrandValue>(NO_TARGET);
  const mergeBrand = useMergeBrand();
  const busy = mergeBrand.isPending;
  useEffect(() => setTarget(NO_TARGET), [merging]);

  function merge() {
    if (!merging || !target.id) return;
    mergeBrand.mutate({ id: merging.id, targetId: target.id, name: merging.name, targetName: target.name }, { onSuccess: onClose });
  }

  return (
    <Modal
      open={!!merging}
      onClose={onClose}
      size="sm"
      title={`Объединить «${merging?.name ?? ""}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="accent" loading={busy} disabled={!target.id} icon={<GitMerge className="h-4 w-4" />} onClick={merge}>
            Объединить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <BrandCombobox
          label="С каким брендом"
          brands={brands}
          value={target}
          onChange={setTarget}
          allowCreate={false}
          exclude={merging ? [merging.id] : []}
        />
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
          {merging && merging.productCount > 0 ? `${productsWord(merging.productCount)} перейдут` : "Товары перейдут"} к{" "}
          {target.name ? <b className="text-[var(--text)]">«{target.name}»</b> : "выбранному бренду"}, а «{merging?.name}» станет
          его алиасом. Бренд «{merging?.name}» будет удалён.
        </p>
      </div>
    </Modal>
  );
}
