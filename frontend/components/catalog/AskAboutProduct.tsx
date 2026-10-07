"use client";

/**
 * «Запитати про товар» on the product sheet: opens a new support thread about this product (or
 * the open one, if the customer already asked about it — the server merges them). Hidden while
 * support is switched off.
 */
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/context";
import { useAccessToken } from "@/lib/auth";
import { supportApi } from "@/lib/support";
import { haptic } from "@/lib/telegram";

export function AskAboutProduct({ productId, onNavigate }: { productId: string; onNavigate?: () => void }) {
  const t = useT();
  const router = useRouter();
  const token = useAccessToken();
  const { data: config } = useQuery({
    queryKey: ["me", "support", "config"],
    queryFn: () => supportApi.config(),
    enabled: !!token,
    staleTime: 60_000,
  });
  if (!token || (config && !config.enabled)) return null;

  return (
    <button
      type="button"
      onClick={() => {
        haptic();
        onNavigate?.();
        router.push(`/account/support/new/chat?product=${encodeURIComponent(productId)}`);
      }}
      className="nb-chip nb-press tap mt-4 inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold text-[var(--ink)]"
    >
      <LifeBuoy className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
      {t("support.ask")}
    </button>
  );
}
