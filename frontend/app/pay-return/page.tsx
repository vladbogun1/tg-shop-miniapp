"use client";

/**
 * /pay-return?order={id}&lang={uk|ru|en} — where monobank sends the browser after a payment made
 * from the Mini App.
 *
 * It opens in a REGULAR browser (Telegram's in-app one, Safari, Chrome), not inside the Mini App:
 * no initData, no sign-in, nothing to load. The Mini App itself is still running underneath that
 * browser and refreshes the order as soon as it is visible again (components/account/OrderPayment),
 * so all this page has to do is tell the customer to close the window — and offer a way back to the
 * bot when the browser is a separate app.
 *
 * The language comes from the query (the app's own choice is in another browser's storage), and
 * the text is looked up directly so the app-wide language preference is left untouched.
 */
import { CheckCircle2, Send, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { shortOrderId } from "@shop/shared";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { en } from "@/i18n/en";
import { FALLBACK_LOCALE, LOCALE_TAG, normalizeLocale, type Locale } from "@/i18n/locales";
import { ru } from "@/i18n/ru";
import { translate, type Dictionary, type Params } from "@/i18n/types";
import { uk } from "@/i18n/uk";
import { customerApi } from "@/lib/api";

const DICTIONARIES: Record<Locale, Dictionary> = { ru, uk, en };

export default function PayReturnPage() {
  // useSearchParams needs a Suspense boundary, or the whole route bails out of static rendering.
  return (
    <Suspense fallback={null}>
      <PayReturn />
    </Suspense>
  );
}

function PayReturn() {
  const query = useSearchParams();
  const locale = normalizeLocale(query.get("lang")) ?? FALLBACK_LOCALE;
  const orderId = query.get("order");
  const t = (key: string, params?: Params) => translate(DICTIONARIES[locale], locale, key, params);

  // The bot's username is server configuration (prod and the demo stand use different bots), so
  // it is read from the public /api/app-info instead of being baked into the build.
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [closeFailed, setCloseFailed] = useState(false);

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAG[locale];
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    customerApi
      .getAppInfo()
      .then((info) => {
        const name = info.botUsername?.replace(/^@/, "").trim();
        if (!cancelled && name) setBotUrl(`https://t.me/${name}`);
      })
      .catch(() => {
        /* no way back by link — closing the window still works */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function close() {
    // Works in some in-app browsers; a tab the script did not open usually ignores it.
    window.close();
    window.setTimeout(() => setCloseFailed(true), 400);
  }

  return (
    <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-6 py-8 text-center">
      <Logo size="sm" variant="full" />

      <div className="hud-frame flex w-full flex-col items-center rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-6 py-8">
        <div className="grid h-20 w-20 place-items-center rounded-full border border-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] shadow-[0_0_28px_-4px_rgba(34,197,94,.5)]">
          <CheckCircle2 className="h-10 w-10 text-[var(--ok)]" strokeWidth={2.25} />
        </div>
        <h1 className="font-display mt-5 text-[22px] font-extrabold uppercase leading-tight tracking-[0.02em] text-[var(--ink)]">
          {t("payReturn.title")}
        </h1>
        {orderId && (
          <p className="font-display mt-2 text-[13px] font-bold text-[var(--accent)]">
            {t("payReturn.order", { id: shortOrderId(orderId) })}
          </p>
        )}
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--muted)]">{t("payReturn.text")}</p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {botUrl && (
          <a href={botUrl} className="block">
            <Button variant="accent" fullWidth icon={<Send className="h-4 w-4" strokeWidth={2.5} />}>
              {t("payReturn.back")}
            </Button>
          </a>
        )}
        <Button fullWidth icon={<X className="h-4 w-4" strokeWidth={2.5} />} onClick={close}>
          {t("common.close")}
        </Button>
        {closeFailed && <p className="text-[12px] text-[var(--muted)]">{t("payReturn.closeHint")}</p>}
      </div>
    </div>
  );
}
