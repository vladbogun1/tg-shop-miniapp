"use client";

/** Order page card for a DELIVERED order whose lines still wait for a review → Account → Відгуки. */
import { useQuery } from "@tanstack/react-query";
import { Gift, Star } from "lucide-react";
import Link from "next/link";
import type { OrderStatus } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { Image } from "@/lib/image";

export function OrderReviewCta({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const { t, href, locale } = useI18n();
  const delivered = status === "DELIVERED";
  const { data } = useQuery({
    queryKey: ["me", "reviews", "pending", locale, orderId],
    queryFn: () => api.pendingReviews(orderId),
    enabled: delivered,
  });
  if (!delivered || !data || data.length === 0) return null;
  return (
    <section className="nb hud-frame flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--r)] bg-[var(--accent-soft)] text-[var(--accent)]">
        <Gift className="h-6 w-6" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[16px] font-bold uppercase tracking-[.04em] text-[var(--ink)]">{t("reviews.cta.title")}</p>
        <p className="mt-1 text-[13px] font-medium text-[var(--muted)]">{t("reviews.cta.text")}</p>
        <ul className="mt-2 flex -space-x-2">
          {data.slice(0, 5).map((l) => (
            <li key={l.orderItemId} className="h-9 w-9 overflow-hidden rounded-full border-2 border-[var(--surface)] bg-[var(--surface-2)]">
              <Image src={l.imageUrl} alt={l.title} size={80} className="h-full w-full" />
            </li>
          ))}
        </ul>
      </div>
      <Link
        href={href(`/account/reviews?order=${encodeURIComponent(orderId)}`)}
        className="nb-accent nb-press tap nb-up inline-flex min-h-11 shrink-0 items-center justify-center gap-2 px-5 text-[14px]"
      >
        <Star className="h-4 w-4" strokeWidth={2.25} /> {t("reviews.cta.button")}
      </Link>
    </section>
  );
}
