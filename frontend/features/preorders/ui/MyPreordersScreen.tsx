"use client";

import { ArrowLeft, Truck, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { useMyPreorders } from "@/features/preorders/state";
import { haptic } from "@/platform/telegram";
import { PreorderRow } from "./PreorderRow";

function Notice({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  children?: React.ReactNode;
}) {
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

function PreordersHeader() {
  const { t } = useI18n();
  const router = useRouter();
  return (
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
  );
}

/** "My waits": the pre-orders I stand in the queue for, hold, bought or let go. */
export function MyPreordersScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const q = useMyPreorders();
  // the query is disabled until the Telegram sign-in gives a token: that is loading, not empty
  const loading = q.isLoading || (!q.data && !q.isError);
  const ready = !loading && !q.isError;

  return (
    <div className="pt-2 pb-6">
      <PreordersHeader />

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

      {ready && q.list.length === 0 && (
        <Notice
          icon={<Truck className="h-8 w-8" strokeWidth={2.5} />}
          title={t("preorder.account.empty.title")}
          text={t("preorder.account.empty.text")}
        >
          <Button variant="accent" onClick={() => router.push("/")}>
            {t("common.toCatalog")}
          </Button>
        </Notice>
      )}

      {ready && q.list.length > 0 && (
        <div className="flex flex-col gap-3">
          {q.list.map((p, i) => (
            <PreorderRow key={p.id} p={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
