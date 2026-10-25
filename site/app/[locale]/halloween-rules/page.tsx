import type { Metadata } from "next";
import type { Locale } from "@shop/shared";
import { LegalView } from "@/components/info/LegalView";
import { legalPageMeta, loadLegal } from "@/lib/legal";
import { localeOf, type LocaleParams } from "@/lib/route";

/**
 * Rules of the Halloween 2026 pumpkin hunt (content/legal/{uk,ru,en}/halloween-rules.md), linked from
 * the event panel (/hw/spawner.js). Temporary: the titles live here instead of the dictionaries so the
 * event is removed by deleting this folder, the three .md files and the LEGAL_FILES entry.
 */
const TITLE: Record<Locale, string> = {
  uk: "Правила акції «Хеллоуїн-полювання»",
  ru: "Правила акции «Хэллоуин-охота»",
  en: "Halloween Hunt giveaway rules",
};

const DESC: Record<Locale, string> = {
  uk: "Збирай гарбузи на сайті й у Mini App ChiSetup з 26 до 30 жовтня: 50 гарбузів або замовлення — квиток у розіграш 5 призів на стрімі.",
  ru: "Собирай тыквы на сайте и в Mini App ChiSetup с 26 по 30 октября: 50 тыкв или заказ — билет в розыгрыш 5 призов на стриме.",
  en: "Collect pumpkins on the ChiSetup website and Mini App from 26 to 30 October: 50 pumpkins or an order is a ticket to the stream draw of 5 prizes.",
};

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return legalPageMeta(locale, "halloweenRules", TITLE[locale], DESC[locale]);
}

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const doc = await loadLegal("halloweenRules", locale);
  return <LegalView locale={locale} title={TITLE[locale]} doc={doc} />;
}
