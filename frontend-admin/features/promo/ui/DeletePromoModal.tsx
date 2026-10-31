"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { AnimatePresence, motion } from "framer-motion";
import { usesOf } from "../model/promo";
import type { PromoCode } from "../model/types";
import { useDeletePromo } from "../queries";

interface Props {
  /** Код, который собираются удалить; `null` — окно закрыто. */
  promo: PromoCode | null;
  onClose: () => void;
}

export function DeletePromoModal({ promo, onClose }: Props) {
  const deleteM = useDeletePromo(onClose);
  const deleting = deleteM.isPending;
  return (
    <Modal
      open={!!promo}
      onClose={() => (deleting ? undefined : onClose())}
      title="Удалить промокод?"
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={deleting} onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => promo && deleteM.mutate(promo.id)}>
            Удалить
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
        Промокод{" "}
        <AnimatePresence mode="wait">
          <motion.span
            key={promo?.id ?? "none"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono font-semibold text-[var(--text)]"
          >
            {promo?.code}
          </motion.span>
        </AnimatePresence>{" "}
        будет удалён без возможности восстановления.
        {promo && usesOf(promo) > 0
          ? ` Его уже применили ${usesOf(promo)} раз — эти заказы сохранят скидку. Чтобы просто остановить код, лучше выключите его.`
          : ""}
      </p>
    </Modal>
  );
}
