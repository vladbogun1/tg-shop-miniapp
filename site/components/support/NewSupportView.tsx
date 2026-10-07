"use client";

/**
 * /account/support/new — a general question, or with `?product=<id>` a question about a product
 * (this is also where a guest lands after signing in from the product page's «Ask» button).
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { StorefrontProduct } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useSupportConfig } from "@/lib/support";
import { SupportDisabled, SupportTopicCard } from "./parts";
import { SupportQuestionForm } from "./SupportQuestionForm";

export function NewSupportView() {
  const { t, href } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const productId = params?.get("product")?.trim() || null;
  const { config } = useSupportConfig();

  const product = useQuery({
    queryKey: ["product", "byId", productId],
    queryFn: () => api.productById(productId as string),
    enabled: !!productId,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const p = product.data;
  const slug = p && "slug" in p ? (p as StorefrontProduct).slug : null;
  const image = p?.images?.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]?.url ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={href("/account/support")}
        className="inline-flex min-h-11 items-center gap-2 self-start font-display text-[13px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        {t("support.back")}
      </Link>

      <div className="nb flex flex-col gap-4 p-4 sm:p-6">
        <div>
          <h2 className="font-display text-[20px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
            {productId ? t("support.ask.title") : t("support.new")}
          </h2>
          <p className="mt-1 text-[14px] text-[var(--muted)]">{productId ? t("support.ask.lead") : t("support.new.lead")}</p>
        </div>

        {productId &&
          (product.isPending ? (
            <div className="shimmer h-20" />
          ) : p ? (
            <SupportTopicCard
              eyebrow={t("support.product")}
              title={p.title}
              imageUrl={image}
              productPath={`/product/${slug ?? p.id}`}
            />
          ) : null)}

        {config && !config.enabled ? (
          <SupportDisabled />
        ) : (
          <SupportQuestionForm
            productId={productId}
            showSubject={!productId}
            autoFocus
            onCreated={(th) => router.replace(href(`/account/support/${th.id}`))}
          />
        )}
      </div>
    </div>
  );
}
