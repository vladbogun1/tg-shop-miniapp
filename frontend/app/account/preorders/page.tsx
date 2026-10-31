"use client";

/**
 * ACCOUNT → «Мої очікування»: my places in pre-order queues and holds (GET /api/me/preorders — live
 * ones first, then recent history). A held unit → «Купити» (opens the product); an expired hold →
 * «Стати знову»; a waiting place → «Вийти з черги».
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Truck, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { PRE_COLOR } from "@/components/preorder/colors";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";
import { etaWhen, holdUntilText, isLiveHold, preorderApi, preorderKeys, useMyPreorders, type MyPreorder } from "@/lib/preorders";
import { haptic } from "@/lib/telegram";
import { sessionStore } from "@shop/core/storage";

export default function MyPreordersPage() {
  const { t } = useI18n();
  const router = useRouter();
  const q = useMyPreorders();
  // the query is disabled until the Telegram sign-in gives a token: that is loading, not empty
  const loading = q.isLoading || (!q.data && !q.isError);

  return (
    <div className="pt-2 pb-6">
      <header
        className="sticky z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 backdrop-blur-[12px]"
        style={{ top: "var(--safe-top)", background: "rgba(14,14,16,.86)" }}
      >
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => {
            haptic();
            router.push("/account");
          }}
          className="tap nb-press -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <h1 className="nb-up flex-1 truncate text-[18px] font-extrabold text-[var(--ink)]">{t("preorder.account.title")}</h1>
      </header>

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-[92px] rounded-[var(--r-card)]" />
          ))}
        </div>
      )}

      {q.isError && (
        <Notice icon={<WifiOff className="h-8 w-8" strokeWidth={2.5} />} title={t("preorder.account.error")}>
          <Button variant="accent" loading={q.isRefetching} onClick={() => void q.refetch()}>
            {t("common.retry")}
          </Button>
        </Notice>
      )}

      {!loading && !q.isError && q.list.length === 0 && (
        <Notice icon={<Truck className="h-8 w-8" strokeWidth={2.5} />} title={t("preorder.account.empty.title")} text={t("preorder.account.empty.text")}>
          <Button variant="accent" onClick={() => router.push("/")}>
            {t("common.toCatalog")}
          </Button>
        </Notice>
      )}

      {!loading && !q.isError && q.list.length > 0 && (
        <div className="flex flex-col gap-3">
          {q.list.map((p, i) => (
            <Row key={p.id} p={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ p, index }: { p: MyPreorder; index: number }) {
  const { t, tag } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const leave = useMutation({
    mutationFn: () => preorderApi.leave(p.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: preorderKeys.mine });
      void qc.invalidateQueries({ queryKey: ["preorders", "product"] });
    },
  });

  const live = isLiveHold(p);
  // A HELD place whose deadline has passed but the server has not swept yet reads as expired.
  const status = p.status === "HELD" && !live ? "EXPIRED" : p.status;
  const when = etaWhen(p.eta, t, tag);
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

  let line: string;
  let color = "var(--muted)";
  switch (status) {
    case "WAITING":
    case "NOTIFIED":
      line = [p.position != null ? t("preorder.status.waitingPos", { pos: p.position }) : t("preorder.status.waiting"), when]
        .filter(Boolean)
        .join(" · ");
      color = PRE_COLOR;
      break;
    case "HELD":
      line = t("preorder.status.held", { t: holdUntilText(p.holdUntil!, tag) });
      color = "var(--ok)";
      break;
    case "BOUGHT":
      line = t("preorder.status.bought");
      color = "var(--ok)";
      break;
    case "EXPIRED":
      line = t("preorder.status.expired");
      color = "var(--warn)";
      break;
    default:
      line = t("preorder.status.cancelled");
      color = "var(--faint)";
  }
  const dim = status === "BOUGHT" || status === "CANCELLED";

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
            <span className="font-medium text-[var(--faint)]"> · {t("preorder.row.qty", { n: status === "HELD" ? p.heldQty : p.qty })}</span>
          </span>
        </span>
      </button>

      {(status === "HELD" || status === "EXPIRED" || status === "WAITING" || status === "NOTIFIED") && (
        <div className="flex items-center gap-2">
          {status === "HELD" && (
            <Button variant="accent" size="sm" className="flex-1" onClick={openProduct}>
              {t("preorder.row.buy")}
            </Button>
          )}
          {status === "EXPIRED" && (
            <Button variant="surface" size="sm" className="flex-1" onClick={openProduct}>
              {t("preorder.row.again")}
            </Button>
          )}
          {(status === "WAITING" || status === "NOTIFIED") && (
            <Button
              variant="surface"
              size="sm"
              className="flex-1"
              loading={leave.isPending}
              onClick={() => {
                haptic();
                leave.mutate();
              }}
            >
              {t("preorder.leave")}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function Notice({ icon, title, text, children }: { icon: React.ReactNode; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="nb hud-frame mt-2 flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
        {icon}
      </span>
      <h3 className="nb-up text-[17px] font-extrabold text-[var(--ink)]">{title}</h3>
      {text && <p className="max-w-[260px] text-[13px] text-[var(--muted)]">{text}</p>}
      {children}
    </div>
  );
}
