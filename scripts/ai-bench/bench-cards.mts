/**
 * Замер «Карточки»: N товаров, которые раньше заполнил ChatGPT (cardStatus READY), — стираем характеристики и фото,
 * строим тот же промпт, что копирует админка, отправляем в MiniMax с веб-поиском и сравниваем поле за полем.
 *
 *   npx tsx --tsconfig scripts/ai-bench/tsconfig.json scripts/ai-bench/bench-cards.mts [--n 6] [--model …] [--effort low]
 *
 * Данные: _tmp/ai-bench/schema.json (GET /api/admin/catalog/schema), cards-all.json (GET /api/admin/cards/export?status=all).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCardPrompt } from "@/features/cards/model/prompt";
import { normalizeSchema } from "@/features/cards/model/schema";
import { parseCardAnswer } from "@/features/cards/model/parse";
import { reviewProduct } from "@/features/cards/model/review";
import { assignCardIds, type CardItem } from "@/features/cards/model/item";
import { runTool, searchStats, TOOL_DEFS, type ToolBudget } from "./tools.mts";
import { call, costUsd, fmtUsage, UAH_PER_USD, type CallResult, type Usage } from "./minimax.mts";

/**
 * Дописка для вызова по API — в КОНЦЕ промпта, чтобы неизменная часть (правила, схема) оставалась общим префиксом для кэша.
 * Поиск MiniMax отдаёт только страницы и сниппеты: прямых ссылок на картинки он не находит, поэтому фото — ссылкой
 * на страницу товара (сервер сам возьмёт с неё главное фото).
 */
function ownAddendum(budget: number): string {
  return `
## Режим API (важнее правил выше, где они расходятся)
1. Для поиска у тебя инструменты: search (Google) и open_page (текст страницы + og:image). Других способов нет.
2. Бюджет на товар: до ${budget} поисков и до ${budget + 1} открытых страниц. Порядок: найди официальную страницу товара → открой её → при нехватке данных открой 1–2 страницы крупных магазинов или обзоров с таблицей характеристик.
3. Значение бери только из открытой страницы именно этой модели и версии (Pro, Ultra, V2, Air — разные товары!). Если характеристика взята со страницы соседней модели или из одного магазина — уверенность ниже 70.
4. Фото: в "photos" верни 1–3 ссылки на открытые тобой страницы этого товара (официальный сайт первым) или их og:image. Прямые файлы картинок не ищи.
5. Не ищи на chisetup.com.ua — это наш магазин.
6. Если у характеристики несколько режимов (частота опроса, скорость сканирования, DPI, время работы) — бери максимальный заявленный производителем.
7. Как только данных достаточно — сразу отвечай одним блоком \`\`\`json.
`;
}

function apiAddendum(budget: number, count: number): string {
  return `
## Режим API (важнее правил выше, где они расходятся)
1. Бюджет: не больше ${budget * count} поисков на весь ответ (≈${budget} на товар). Ищи сразу точными запросами: «бренд модель specifications», официальный сайт. Не повторяй похожие запросы.
2. Фото: прямые ссылки на файлы картинок НЕ ищи. В "photos" верни 1–3 ссылки на страницы этого товара (официальный сайт первым, затем крупный магазин) — главное фото с них мы возьмём сами.
3. Не ищи на chisetup.com.ua — это наш магазин, его данные ты уже видишь во входе.
4. Как только данных достаточно — сразу отвечай одним блоком \`\`\`json.
`;
}

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const N = Number(arg("n", "6"));
const MODEL = arg("model", "MiniMax-M3.1-Flash");
const EFFORT = arg("effort", "low") as "low";
const PER = Number(arg("per", "1"));
const BUDGET = Number(arg("budget", "4"));
/** minimax — встроенный web_search ($0,01 за поиск); own — наш SearXNG + загрузка страниц. */
const SEARCH = arg("search", "own");
const CATS = arg("cats", "myshki,klv-magnitnye,kovriki-tkanevye,naushniki-polnorazmernye,glaydy,rukava,kabelya,naushniki-iem,klv-mekhanicheskie,kresla").split(",");
/** С какого «круга» брать товары категории (0 — первые; прошлые замеры брали круг 0). */
const FROM = Number(arg("from", "0"));
/** Сколько запросов одновременно (бережём бесплатные лимиты Google CSE и r.jina.ai). */
const POOL = Number(arg("pool", "4"));
const DATA = "../../_tmp/ai-bench";
const OUT = `${DATA}/cards-${arg("search", "own")}-${MODEL}-${EFFORT}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`;

const schema = normalizeSchema(JSON.parse(readFileSync(`${DATA}/schema.json`, "utf8")));
const all: CardItem[] = JSON.parse(readFileSync(`${DATA}/cards-all.json`, "utf8"));

/** Модель без цвета/варианта: «Мышь ATK Blazing Sky …» → «atk blazing sky». Цветовые варианты одной модели — один товар для замера. */
const modelKey = (title: string) => title.toLowerCase().split(/\s+/).slice(1, 4).join(" ");

/** По одной модели из каждой категории списка, с богатой эталонной карточкой; круг FROM — пропустить уже проверенные. */
function pick(): CardItem[] {
  const out: CardItem[] = [];
  const pools = new Map(
    CATS.map((cat) => {
      const seen = new Set<string>();
      const pool = all.filter((p) => p.categorySlug === cat && p.cardStatus === "READY" && Object.keys(p.specs ?? {}).length >= 5 && p.brand);
      return [cat, pool.filter((p) => !seen.has(modelKey(p.title)) && seen.add(modelKey(p.title)))] as const;
    }),
  );
  for (let round = FROM; out.length < N && round < FROM + 10; round++) {
    for (const cat of CATS) {
      const p = pools.get(cat)![round];
      if (p && out.length < N) out.push(p);
    }
  }
  return out;
}

type Spec = Record<string, unknown>;
const norm = (v: unknown): string => {
  if (Array.isArray(v) && v.length === 1) return norm(v[0]);
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(x).toLowerCase()).sort());
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v).trim().toLowerCase();
};
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.03);
  const ra = a as { min?: number; max?: number }, rb = b as { min?: number; max?: number };
  if (ra && rb && typeof ra === "object" && typeof rb === "object" && "min" in ra && "min" in rb) return same(ra.min, rb.min) && same(ra.max, rb.max);
  return norm(a) === norm(b);
}

interface Cmp {
  title: string;
  refN: number;
  match: string[];
  diff: string[];
  missing: string[];
  extra: string[];
  photos: number;
  sources: number;
  overall: unknown;
  problems: number;
  titleRu: string;
}

function compare(ref: CardItem, entry: unknown, item: CardItem): Cmp {
  const e = (entry ?? {}) as { specs?: Spec; photos?: unknown[]; sources?: unknown[]; overall?: unknown; title?: { ru?: string } };
  const refSpecs = (ref.specs ?? {}) as Spec;
  const ai = e.specs ?? {};
  const c: Cmp = { title: ref.title, refN: Object.keys(refSpecs).length, match: [], diff: [], missing: [], extra: [], photos: e.photos?.length ?? 0, sources: e.sources?.length ?? 0, overall: e.overall, problems: 0, titleRu: e.title?.ru ?? "" };
  for (const [k, v] of Object.entries(refSpecs)) {
    if (!(k in ai)) c.missing.push(k);
    else if (same(v, ai[k])) c.match.push(k);
    else c.diff.push(`${k}: ChatGPT ${JSON.stringify(v)} → MiniMax ${JSON.stringify(ai[k])}`);
  }
  for (const k of Object.keys(ai)) if (!(k in refSpecs)) c.extra.push(`${k}=${JSON.stringify(ai[k])}`);
  const rv = reviewProduct("x", item, entry, schema);
  c.problems = "problems" in rv ? rv.problems.length : rv.issues.filter((i) => i.level === "error").length;
  return c;
}

function addUsage(a: Usage, b: Usage): void {
  for (const k of Object.keys(a) as (keyof Usage)[]) a[k] += b[k];
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const refs = pick();
  const items: CardItem[] = refs.map((p) => ({ ...p, specs: {}, imageUrl: null, cardStatus: "DRAFT", cardMeta: null, cardConfidence: null }));
  const ids = assignCardIds(all.map((p) => p.id));
  const batches: CardItem[][] = [];
  for (let i = 0; i < items.length; i += PER) batches.push(items.slice(i, i + PER));
  console.log(`Товаров ${items.length}, по ${PER} в запросе, бюджет ${BUDGET} поисков/товар. Модель ${MODEL}, effort ${EFFORT}, одновременно ${POOL}…`);
  let repairs = 0, failed = 0;
  const perItem: { title: string; usd: number; ms: number; tools: number }[] = [];

  const runBatch = async (b: CardItem[], i: number): Promise<CallResult> => {
    const own = SEARCH === "own";
    const prompt = buildCardPrompt(b, schema, { part: 1, total: 1, ids }) + (own ? ownAddendum(BUDGET) : apiAddendum(BUDGET, b.length));
    const left: ToolBudget = { search: BUDGET * b.length, open_page: (BUDGET + 1) * b.length };
    const toolOpts = own ? { clientTools: { defs: TOOL_DEFS, run: (n: string, inp: Record<string, unknown>) => runTool(n, inp, left) } } : { search: true, maxSearches: BUDGET * b.length };
    writeFileSync(`${OUT}/prompt-${i + 1}.md`, prompt);
    const r = await call([{ role: "user", content: prompt }], { model: MODEL, effort: EFFORT, ...toolOpts, maxTokens: 64000, timeoutMs: 900_000 });
    // Битый JSON (лишняя скобка, обрыв) — один повтор без инструментов: модель получает ошибку разбора и присылает блок заново.
    const errs = parseCardAnswer(r.text).errors;
    if (errs.length) {
      const fix = await call(
        [
          { role: "user", content: prompt },
          { role: "assistant", content: r.text || "(пусто)" },
          { role: "user", content: `JSON не читается: ${errs.join("; ").slice(0, 400)}. Больше ничего не ищи — пришли исправленный ответ целиком одним блоком \`\`\`json.` },
        ],
        { model: MODEL, effort: "low", maxTokens: 32000, timeoutMs: 300_000 },
      );
      addUsage(r.usage, fix.usage);
      r.ms += fix.ms;
      console.log(`— пакет ${i + 1}: повтор из-за «${errs[0].slice(0, 80)}» → ${parseCardAnswer(fix.text).errors.length ? "снова ошибка" : "исправлено"}`);
      r.text = fix.text;
      repairs++;
    }
    writeFileSync(`${OUT}/answer-${i + 1}.md`, r.text);
    writeFileSync(`${OUT}/raw-${i + 1}.json`, JSON.stringify(r.raw, null, 2));
    perItem.push({ title: b.map((x) => x.title).join(", "), usd: costUsd(r.usage), ms: r.ms, tools: r.usage.toolCalls });
    console.log(`— пакет ${i + 1}: ${b.map((x) => x.title).join(", ")}
${fmtUsage(r)}`);
    return r;
  };
  const empty = (): CallResult => ({ text: "", thinkingChars: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, requests: 0, requestsWithSearch: 0, toolCalls: 0 }, ms: 0, stopReason: "error", searchUrls: [], raw: [] });
  const results: CallResult[] = new Array(batches.length);
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const i = next++;
      results[i] = await runBatch(batches[i], i).catch((e) => {
        console.error(`— пакет ${i + 1} упал: ${String(e).slice(0, 300)}`);
        failed++;
        return empty();
      });
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(POOL, batches.length) }, worker));
  const wall = Date.now() - t0;
  const total: CallResult = { text: results.map((r) => r.text).join("\n"), thinkingChars: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, requests: 0, requestsWithSearch: 0, toolCalls: 0 }, ms: Math.max(...results.map((r) => r.ms)), stopReason: results.map((r) => r.stopReason).join(","), searchUrls: [], raw: [] };
  for (const r of results) { addUsage(total.usage, r.usage); total.thinkingChars += r.thinkingChars; }
  const r = total;
  const parsed = parseCardAnswer(r.text);
  const lines: string[] = [`# Карточки: ${MODEL}, effort ${EFFORT}, ${items.length} товаров, по ${PER} в запросе, бюджет ${BUDGET}`, "", "```", fmtUsage(r), "```", ""];
  if (parsed.errors.length) lines.push(`Ошибки разбора: ${parsed.errors.join("; ")}`, "");
  let refTotal = 0, matchTotal = 0, diffTotal = 0, missTotal = 0, extraTotal = 0;
  for (const [i, ref] of refs.entries()) {
    const key = ids.get(ref.id)!;
    const entry = parsed.entries.get(key.toLowerCase());
    if (!entry) {
      lines.push(`## ${ref.title}`, "**нет в ответе**", "");
      refTotal += Object.keys(ref.specs ?? {}).length;
      continue;
    }
    const c = compare(ref, entry, items[i]);
    refTotal += c.refN; matchTotal += c.match.length; diffTotal += c.diff.length; missTotal += c.missing.length; extraTotal += c.extra.length;
    lines.push(
      `## ${ref.title}`,
      `Название MiniMax: ${c.titleRu}`,
      `Совпало ${c.match.length}/${c.refN}, расходится ${c.diff.length}, не заполнено ${c.missing.length}, новых полей ${c.extra.length}; фото ${c.photos}, источников ${c.sources}, overall ${String(c.overall)}, ошибок проверки ${c.problems}`,
      ...c.diff.map((d) => `- ≠ ${d}`),
      c.missing.length ? `- пусто: ${c.missing.join(", ")}` : "",
      c.extra.length ? `- сверх эталона: ${c.extra.join(", ")}` : "",
      "",
    );
  }
  const usd = costUsd(r.usage);
  const uah = perItem.map((p) => p.usd * UAH_PER_USD).sort((a, b) => a - b);
  const secs = perItem.map((p) => p.ms / 1000).sort((a, b) => a - b);
  const med = (xs: number[]) => xs[Math.floor(xs.length / 2)] ?? 0;
  lines.splice(
    2,
    0,
    `**Итог:** совпало ${matchTotal}/${refTotal} полей эталона (${Math.round((100 * matchTotal) / Math.max(1, refTotal))} %), расходится ${diffTotal}, пусто ${missTotal}, сверх эталона ${extraTotal}. Цена на товар ≈ ${((usd * UAH_PER_USD) / items.length).toFixed(2)} грн.`,
    `Грн на товар: медиана ${med(uah).toFixed(2)}, макс ${(uah.at(-1) ?? 0).toFixed(2)}. Секунд на товар: медиана ${med(secs).toFixed(0)}, макс ${(secs.at(-1) ?? 0).toFixed(0)}. Весь прогон ${(wall / 1000).toFixed(0)} с при ${POOL} одновременно. Повторов из-за JSON ${repairs}, упавших ${failed}. Поисков ${searchStats.total}, пустых ${searchStats.empty}; движки ${JSON.stringify(searchStats.engines)}.`,
    "",
  );
  writeFileSync(`${OUT}/REPORT.md`, lines.join("\n"));
  console.log(lines.slice(0, 7).join("\n"));
  console.log(`Отчёт: ${OUT}/REPORT.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
