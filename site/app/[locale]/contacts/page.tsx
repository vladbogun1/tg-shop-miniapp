import { AtSign, Clock, MapPin, MessageCircle, Send, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { alternates, localePath, makeT } from "@/i18n";
import { BOT_URL, OWNER_TELEGRAM, SELLER } from "@/lib/config";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("info.contacts"), alternates: alternates("/contacts", locale) };
}

export default async function ContactsPage({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const ownerLink = (
    <a
      href={`https://t.me/${OWNER_TELEGRAM}`}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-2 underline-offset-2 hover:text-[var(--accent)]"
    >
      @{OWNER_TELEGRAM}
    </a>
  );
  const rows = [
    { icon: AtSign, label: t("contacts.owner"), value: ownerLink },
    { icon: MapPin, label: t("contacts.pickup"), value: t("contacts.pickupValue") },
    { icon: Clock, label: t("contacts.hours"), value: t("contacts.hoursValue") },
    { icon: User, label: t("contacts.seller"), value: <>{SELLER.name}, РНОКПП {SELLER.taxId}</> },
  ];
  return (
    <div className="container-site pt-6">
      <Breadcrumbs locale={locale} items={[{ label: t("info.contacts") }]} />
      <h1 className="text-[32px] font-black uppercase tracking-tight text-[var(--ink)] sm:text-[40px]">{t("info.contacts")}</h1>
      <p className="mt-2 max-w-2xl text-[16px] font-semibold text-[var(--muted)]">{t("contacts.lead")}</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="nb-lg flex flex-col gap-4 bg-[var(--c2)] p-6 text-white">
          <Send className="h-8 w-8" strokeWidth={2.5} />
          <h2 className="text-[22px] font-black uppercase">{t("contacts.telegram")}</h2>
          <p className="text-[15px] font-semibold opacity-90">{t("contacts.telegramText")}</p>
          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-2 self-start rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] px-5 text-[14px] font-black uppercase tracking-wide text-[var(--ink)] shadow-[4px_4px_0_var(--shadow)] hover:-translate-y-[1px]"
          >
            {BOT_URL.replace("https://", "")}
          </a>
          <div className="mt-2 border-t-[2px] border-white/40 pt-4">
            <p className="flex items-center gap-2 text-[15px] font-black uppercase">
              <MessageCircle className="h-5 w-5" strokeWidth={2.5} /> {t("contacts.orderChat")}
            </p>
            <p className="mt-1 text-[14px] font-semibold opacity-90">
              {t("contacts.orderChatText")}{" "}
              <Link href={localePath(locale, "/account")} className="underline decoration-2 underline-offset-2">
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
                  <dt className="nb-up text-[11px] font-black text-[var(--faint)]">{label}</dt>
                  <dd className="text-[15px] font-semibold text-[var(--ink)]">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
