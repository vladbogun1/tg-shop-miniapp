"use client";

import { motion } from "framer-motion";
import { CheckCheck, LifeBuoy } from "lucide-react";
import { useT } from "@/i18n/context";
import { Image } from "@/lib/image";

/** Online / closed / waiting line under the title of a created thread. */
function useStatusText(closed: boolean, awaiting: boolean, connected: boolean) {
  const t = useT();
  if (closed) return t("support.status.CLOSED");
  if (awaiting) return t("support.waiting");
  return connected ? t("chat.online") : t("chat.connecting");
}

export function SupportHeader({
  title,
  productTitle,
  productImage,
  isDraft,
  connected,
  closed,
  awaiting,
  canClose,
  onClose,
}: {
  title: string;
  productTitle: string | null;
  productImage: string | null;
  isDraft: boolean;
  connected: boolean;
  closed: boolean;
  awaiting: boolean;
  canClose: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const status = useStatusText(closed, awaiting, connected);
  return (
    <>
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--accent)] bg-[var(--accent-soft)]">
          {productImage ? (
            <Image src={productImage} alt={title} size={96} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[var(--accent)]">
              <LifeBuoy className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[15px] font-bold text-[var(--ink)]">{title}</p>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)]">
            {isDraft ? (
              productTitle ? t("support.aboutProduct") : t("support.title")
            ) : (
              <>
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background: connected ? "var(--ok)" : "var(--faint)",
                    boxShadow: connected ? "0 0 6px var(--ok)" : "none",
                  }}
                />
                {status}
              </>
            )}
          </p>
        </div>
        {canClose && (
          <motion.button
            type="button"
            aria-label={t("support.close")}
            title={t("support.close")}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.07 }}
            onClick={() => onClose()}
            className="tap flex shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]"
          >
            <CheckCheck className="h-5 w-5" strokeWidth={2.25} />
          </motion.button>
        )}

    </>
  );
}
