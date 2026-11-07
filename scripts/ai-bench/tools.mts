/**
 * Свои инструменты исследования вместо платного web_search MiniMax ($0,01 за каждый поиск):
 *  - search(query)   → SearXNG (у нас на s3, движок Google CSE) — заголовок, ссылка, сниппет;
 *  - open_page(url)  → загрузка страницы нашим кодом, текст без разметки + og:image.
 * Модель решает, что искать и что открыть; мы платим только за токены. Лимиты вызовов держит код, а не промпт.
 */
import type { Block } from "./minimax.mts";

const SEARX = process.env.SEARX_URL ?? "http://127.0.0.1:18888";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const BLOCKED_HOSTS = ["chisetup.com.ua", "instagram.com", "youtube.com", "facebook.com", "tiktok.com"];
const PAGE_CHARS = 9000;

export const TOOL_DEFS: Block[] = [
  {
    type: "custom",
    name: "search",
    description: "Поиск в интернете (Google). Возвращает до 8 результатов: заголовок, ссылка, короткий фрагмент. Пиши точный запрос: бренд + модель + specifications.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    type: "custom",
    name: "open_page",
    description: "Открыть страницу по ссылке и получить её текст (до 9000 символов) и главное фото (og:image). Открывай официальный сайт и страницы с таблицей характеристик.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
];

const blocked = (url: string) => {
  try {
    const h = new URL(url).hostname;
    return BLOCKED_HOSTS.some((b) => h === b || h.endsWith(`.${b}`));
  } catch {
    return true;
  }
};

async function fetchText(url: string, ms: number): Promise<{ status: number; body: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "accept-language": "en,ru;q=0.8,uk;q=0.7" }, signal: ctl.signal, redirect: "follow" });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

/** Счётчики для отчёта замера: сколько поисков вернули пусто и какие движки отвечали. */
export const searchStats = { total: 0, empty: 0, engines: {} as Record<string, number> };

export async function search(query: string): Promise<string> {
  searchStats.total++;
  const { status, body } = await fetchText(`${SEARX}/search?format=json&q=${encodeURIComponent(query)}`, 30_000);
  if (status !== 200) {
    searchStats.empty++;
    return `Ошибка поиска: HTTP ${status}`;
  }
  const results = (JSON.parse(body).results ?? []) as { title: string; url: string; content?: string; engines?: string[] }[];
  const clean = results.filter((r) => !blocked(r.url)).slice(0, 8);
  for (const r of clean) for (const e of r.engines ?? []) searchStats.engines[e] = (searchStats.engines[e] ?? 0) + 1;
  if (!clean.length) {
    searchStats.empty++;
    return "Поиск ничего не вернул. Не угадывай адреса страниц — попробуй другой запрос или отвечай по найденному.";
  }
  return clean.map((r, i) => `${i + 1}. ${r.title}\n${r.url.replace(/[?&]srsltid=[^&]+/, "")}\n${(r.content ?? "").slice(0, 300)}`).join("\n\n");
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

export function htmlToText(html: string): { text: string; ogImage: string | null; title: string } {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i)?.[1] ?? null;
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { text, ogImage: og, title };
}

const SPEC_WORDS = /(specification|specs|technical|характеристик|параметр|weight|вес|вага|dimensions|sensor|switch|frequency|impedance|polling|material)/i;

/**
 * Страницы магазинов — это в основном меню и ссылки. Убираем картинки/ссылки и повторы строк, затем берём начало
 * страницы и окно с первого «характеристики/specs», чтобы таблица характеристик попала в лимит.
 */
export function compactText(text: string, limit = PAGE_CHARS): string {
  const seen = new Set<string>();
  const lines = text
    .split("\n")
    .map((l) => l.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim())
    .filter((l) => {
      if (l.length < 3 || seen.has(l)) return false;
      seen.add(l);
      return true;
    });
  const all = lines.join("\n");
  if (all.length <= limit) return all;
  const at = lines.findIndex((l, i) => i > 5 && SPEC_WORDS.test(l));
  const head = lines.slice(0, at > 0 ? Math.min(at, 40) : 40).join("\n").slice(0, Math.floor(limit / 6));
  const tail = at > 0 ? lines.slice(at).join("\n") : all.slice(head.length);
  return `${head}\n…\n${tail}`.slice(0, limit);
}

/** Запасной путь: читалка r.jina.ai (открывает сайты, которые режут прямые запросы и JS-страницы). */
async function viaReader(url: string): Promise<{ text: string; ogImage: string | null; title: string } | null> {
  const { status, body } = await fetchText(`https://r.jina.ai/${url}`, 40_000);
  if (status !== 200) return null;
  const title = body.match(/^Title: (.*)$/m)?.[1] ?? "";
  const img = body.match(/!\[[^\]]*\]\((https:[^)\s]+\.(?:jpg|jpeg|png|webp)[^)\s]*)\)/i)?.[1] ?? null;
  return { text: body.replace(/^[\s\S]*?Markdown Content:\n/, ""), ogImage: img, title };
}

export async function openPage(url: string): Promise<string> {
  if (blocked(url)) return "Эту страницу открывать не нужно.";
  let page: { text: string; ogImage: string | null; title: string } | null = null;
  const direct = await fetchText(url, 20_000).catch(() => null);
  if (direct && direct.status < 400) page = htmlToText(direct.body);
  if (!page || page.text.length < 500) page = (await viaReader(url).catch(() => null)) ?? page;
  if (!page || page.text.length < 200) return "Страница не открылась или почти пустая. Попробуй другую.";
  return `Заголовок: ${page.title}\nog:image: ${page.ogImage ?? "нет"}\n\n${compactText(page.text)}`;
}

export interface ToolBudget {
  search: number;
  open_page: number;
}

/** Выполнить вызов инструмента с учётом бюджета; при исчерпании — просьба отвечать. */
export async function runTool(name: string, input: Record<string, unknown>, left: ToolBudget): Promise<string> {
  if (name !== "search" && name !== "open_page") return `Нет инструмента ${name}.`;
  if (left[name] <= 0) return "Лимит этого инструмента исчерпан. Отвечай по уже найденному.";
  left[name]--;
  return name === "search" ? search(String(input.query ?? "")) : openPage(String(input.url ?? ""));
}
