import { AtSign, Clock, MapPin, MessageCircle, Send, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { localePath, makeT } from "@/i18n";
import { BOT_URL, OWNER_TELEGRAM, SELLER } from "@/lib/config";
import { localeOf, type LocaleParams } from "@/lib/route";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return pageMeta({ locale, path: "/contacts", title: t("info.contacts"), description: t("meta.desc.contacts") });
}

export default async function ContactsPage({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const ownerLink = (
    <a
      href={`https://t.me/${OWNER_TELEGRAM}`}
      target="_blank"
      rel="noopener noreferrer"
      className="link-ink"
    >
      @{OWNER_TELEGRAM}
    </a>
  );
  const rows = [
    { icon: AtSign, label: t("contacts.owner"), value: ownerLink },
    { icon: MapPin, label: t("contacts.pickup"), value: t("contacts.pickupValue") },
    { icon: Clock, label: t("contacts.hours"), value: t("contacts.hoursValue") },
    { icon: User, label: t("contacts.seller"), value: t("contacts.sellerValue", { taxId: SELLER.taxId }) },
  ];
  return (
    <div className="container-site pt-6">
      <Breadcrumbs locale={locale} items={[{ label: t("info.contacts") }]} />
      <h1 className="font-display text-[30px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[38px]">{t("info.contacts")}</h1>
      <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-[var(--muted)]">{t("contacts.lead")}</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="nb-lg hud-frame flex flex-col gap-4 p-6">
          <Send className="h-8 w-8 text-[var(--accent)]" strokeWidth={2} />
          <h2 className="font-display text-[22px] font-extrabold uppercase tracking-[.02em]">{t("contacts.telegram")}</h2>
          <p className="text-[15px] leading-relaxed text-[var(--muted)]">{t("contacts.telegramText")}</p>
          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="chamfer inline-flex min-h-12 items-center gap-2 self-start bg-[var(--accent)] px-5 font-display text-[14px] font-bold uppercase tracking-[.06em] text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-hi)]"
          >
            {BOT_URL.replace("https://", "")}
          </a>
          <div className="mt-2 border-t border-[var(--line)] pt-4">
            <p className="flex items-center gap-2 font-display text-[15px] font-bold uppercase tracking-[.06em]">
              <MessageCircle className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} /> {t("contacts.orderChat")}
            </p>
            <p className="mt-1 text-[14px] text-[var(--muted)]">
              {t("contacts.orderChatText")}{" "}
              <Link href={localePath(locale, "/account")} className="link-ink text-[var(--ink)]">
                {t("header.account")}
              </Link>
            </p>
          </div>
        </section>
        <section className="nb p-6">
          <dl className="flex flex-col gap-4">
            {rows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
                <div>
                  <dt className="eyebrow text-[11px]">{label}</dt>
                  <dd className="text-[15px] font-medium text-[var(--ink)]">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
