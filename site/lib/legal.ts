/**
 * Legal texts (site/content/legal/{uk,ru,en}/*.md) → HTML, on the server.
 *
 * The files are written by the owner and live in the repo, so their HTML is trusted. Internal links
 * (`/returns`) are rewritten to the current locale's prefix. Ukrainian is the original; ru/en are
 * translations. A language whose file is missing falls back to the Ukrainian text, and the page
 * then shows a note saying so (and its metadata points at the Ukrainian page, see seo.ts).
 */
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import type { Metadata } from "next";
import { alternates, localePath } from "@/i18n";
import { FALLBACK_LOCALE, LOCALES, type Locale } from "@/i18n/locales";
import { pageMeta } from "./seo";

export const LEGAL_FILES = {
  delivery: "delivery-payment.md",
  returns: "returns.md",
  warranty: "warranty.md",
  privacy: "privacy.md",
  terms: "terms.md",
} as const;

export type LegalPage = keyof typeof LEGAL_FILES;

/** Site path of each legal page (without the locale prefix). */
export const LEGAL_PATHS: Record<LegalPage, string> = {
  delivery: "/delivery",
  returns: "/returns",
  warranty: "/warranty",
  privacy: "/privacy",
  terms: "/terms",
};

export interface LegalDoc {
  title: string | null;
  updated: string | null;
  html: string;
  /** The language the text is actually in: the requested one, or "uk" when it is not translated. */
  contentLocale: Locale;
}

function legalFile(page: LegalPage, locale: Locale): string {
  return path.join(process.cwd(), "content", "legal", locale, LEGAL_FILES[page]);
}

/** Whether `page` has its own text in `locale` (Ukrainian always does — it is the original). */
export function hasLegalText(page: LegalPage, locale: Locale): boolean {
  return locale === FALLBACK_LOCALE || existsSync(legalFile(page, locale));
}

/** Paths of legal pages that still have no text in some language (their copies are canonical to uk). */
export function untranslatedLegalPaths(locales: readonly Locale[]): string[] {
  return (Object.keys(LEGAL_FILES) as LegalPage[])
    .filter((p) => locales.some((l) => !hasLegalText(p, l)))
    .map((p) => LEGAL_PATHS[p]);
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

export async function loadLegal(page: LegalPage, locale: Locale): Promise<LegalDoc> {
  const contentLocale: Locale = hasLegalText(page, locale) ? locale : FALLBACK_LOCALE;
  const raw = await fs.readFile(legalFile(page, contentLocale), "utf8");
  const { meta, body } = parseFrontmatter(raw);
  let html = await marked.parse(body, { gfm: true, breaks: false });
  // Site-internal links follow the visitor's language.
  html = html.replace(/href="(\/[^"]*)"/g, (_, p: string) => `href="${localePath(locale, p)}"`);
  return { title: meta.title ?? null, updated: meta.updated ?? null, html, contentLocale };
}

/**
 * Metadata of a legal page. Translated languages get the usual canonical + hreflang set. A language
 * without its own text renders the Ukrainian original (with a note), so it is canonical to the
 * Ukrainian page and is left out of hreflang — three URLs with one text would be duplicates. The
 * sitemap follows the same rule ({@link untranslatedLegalPaths}).
 */
export function legalPageMeta(locale: Locale, page: LegalPage, title: string, description: string): Metadata {
  const path = LEGAL_PATHS[page];
  const translated = LOCALES.filter((l) => hasLegalText(page, l));
  if (translated.length === LOCALES.length) return pageMeta({ locale, path, title, description });
  const all = alternates(path, locale);
  const languages = Object.fromEntries(
    Object.entries(all.languages).filter(([l]) => l === "x-default" || translated.includes(l as Locale))
  );
  const canonical = hasLegalText(page, locale) ? all.canonical : localePath(FALLBACK_LOCALE, path);
  return pageMeta({ locale, path, title, description, alternates: { canonical, languages } });
}
