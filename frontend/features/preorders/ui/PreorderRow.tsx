"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { sessionStore } from "@shop/core/storage";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";
import { preorderApi, preorderKeys, type MyPreorder } from "@/lib/preorders";
import { haptic } from "@/platform/telegram";
import { preorderScreenKeys } from "../keys";
import { rowStatus, statusLine, type RowStatus } from "../model/status";

/** The one action a row offers: buy (held), try again (expired) or leave the queue (waiting). */
function RowAction({
  status,
  leaving,
  onOpen,
  onLeave,
}: {
  status: RowStatus;
  leaving: boolean;
  onOpen: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  if (status === "HELD") {
    return (
      <Button variant="accent" size="sm" className="flex-1" onClick={onOpen}>
        {t("preorder.row.buy")}
      </Button>
    );
  }
  if (status === "EXPIRED") {
    return (
      <Button variant="surface" size="sm" className="flex-1" onClick={onOpen}>
        {t("preorder.row.again")}
      </Button>
    );
  }
  if (status === "WAITING" || status === "NOTIFIED") {
    return (
      <Button variant="surface" size="sm" className="flex-1" loading={leaving} onClick={onLeave}>
        {t("preorder.leave")}
      </Button>
    );
  }
  return null;
}

export function PreorderRow({ p, index }: { p: MyPreorder; index: number }) {
  const { t, tag } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const leave = useMutation({
    mutationFn: () => preorderApi.leave(p.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: preorderKeys.mine });
      void qc.invalidateQueries({ queryKey: preorderScreenKeys.products });
    },
  });

  const status = rowStatus(p);
  const { line, color } = statusLine(p, status, t, tag);
  const openProduct = () => {
    haptic();
    // The catalog may already be mounted (cached) and read the URL before the push lands: hand the id over too.
    try {
      sessionStore.setItem("shop:open-product", p.productId);
    } catch {
      /* private mode: the URL alone still works on a fresh load */
    }
    router.push(`/?product=${p.productId}`);
  };
  const dim = status === "BOUGHT" || status === "CANCELLED";
  const hasAction = status !== "BOUGHT" && status !== "CANCELLED";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: Math.min(index, 8) * 0.05 }}
      className={`nb flex flex-col gap-3 p-3.5 ${dim ? "opacity-75" : ""}`}
    >
      <button type="button" onClick={openProduct} className="nb-press flex min-w-0 items-center gap-3 text-left">
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
          <Image imageKey={p.imageUrl} alt={p.productTitle} size={200} sizes="64px" className="h-full w-full" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-[var(--ink)]">{p.productTitle}</span>
          {p.variantName && <span className="block truncate text-[12px] text-[var(--muted)]">{p.variantName}</span>}
          <span className="mt-1 block text-[12.5px] font-semibold leading-snug" style={{ color }}>
            {line}
            <span className="font-medium text-[var(--faint)]">
              {" "}
              · {t("preorder.row.qty", { n: status === "HELD" ? p.heldQty : p.qty })}
            </span>
          </span>
        </span>
      </button>

      {hasAction && (
        <div className="flex items-center gap-2">
          <RowAction
            status={status}
            leaving={leave.isPending}
            onOpen={openProduct}
            onLeave={() => {
              haptic();
              leave.mutate();
            }}
          />
        </div>
      )}
    </motion.div>
  );
}
