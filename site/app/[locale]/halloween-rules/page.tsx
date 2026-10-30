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
  uk: "Два розіграші ChiSetup на Хеллоуїн 30.10–01.11.2026: за гарбузи на сайті й у Mini App і за покупки. Розігруємо наживо 1 листопада о 19:00.",
  ru: "Два розыгрыша ChiSetup на Хэллоуин 30.10–01.11.2026: за тыквы на сайте и в Mini App и за покупки. Разыгрываем вживую 1 ноября в 19:00.",
  en: "Two ChiSetup Halloween draws, 30.10–01.11.2026: pumpkins on the site and in the Mini App, and purchases. Live draw on November 1 at 19:00 Kyiv.",
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
