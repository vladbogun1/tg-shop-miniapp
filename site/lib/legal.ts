/**
 * Legal texts (site/content/legal/uk/*.md) → HTML, on the server.
 *
 * The files are written by the owner and live in the repo, so their HTML is trusted. Internal links
 * (`/returns`) are rewritten to the current locale's prefix. ru/en have no translation yet: they
 * render the Ukrainian text and the page shows a note saying so.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { localePath } from "@/i18n";
import type { Locale } from "@/i18n/locales";

export const LEGAL_FILES = {
  delivery: "delivery-payment.md",
  returns: "returns.md",
  warranty: "warranty.md",
  privacy: "privacy.md",
  terms: "terms.md",
} as const;

export type LegalPage = keyof typeof LEGAL_FILES;

export interface LegalDoc {
  title: string | null;
  updated: string | null;
  html: string;
  /** The language the text is actually in (always "uk" for now). */
  contentLocale: Locale;
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
  const file = path.join(process.cwd(), "content", "legal", "uk", LEGAL_FILES[page]);
  const raw = await fs.readFile(file, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  let html = await marked.parse(body, { gfm: true, breaks: false });
  // Site-internal links follow the visitor's language.
  html = html.replace(/href="(\/[^"]*)"/g, (_, p: string) => `href="${localePath(locale, p)}"`);
  return { title: meta.title ?? null, updated: meta.updated ?? null, html, contentLocale: "uk" };
}
