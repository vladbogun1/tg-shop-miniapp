/**
 * Минимальный клиент MiniMax (Anthropic-совместимый /v1/messages) для замера расхода.
 * Явный таймаут, повтор только на 429/5xx (запрос идемпотентен — ничего не меняет у нас), обработка pause_turn
 * (лимит поисков внутри запроса). Ключ читается из файла и никуда не выводится.
 */
import { readFileSync } from "node:fs";

export const PRICE = { in: 0.15, out: 0.6, cacheRead: 0.015, search: 0.01 } as const; // $ / 1M токенов, $ / поиск
export const UAH_PER_USD = 45.35;

const KEY_FILE = process.env.MINIMAX_ENV ?? "D:/CLOUDE/_private/minimax/.env";
const BASE = process.env.MINIMAX_BASE ?? "https://api.minimax.io/anthropic";

function apiKey(): string {
  const line = readFileSync(KEY_FILE, "utf8").split(/\r?\n/).find((l) => l.startsWith("MINIMAX_API_KEY="));
  const key = line?.slice("MINIMAX_API_KEY=".length).trim();
  if (!key) throw new Error(`Нет MINIMAX_API_KEY в ${KEY_FILE}`);
  return key;
}

export type Block = Record<string, unknown> & { type: string };
export interface Msg {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface CallOptions {
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  system?: string;
  search?: boolean;
  /** Сколько поисков разрешено на весь вызов; дальше — просьба ответить без поиска. */
  maxSearches?: number;
  /** Свои инструменты (выполняет наш код): описания для модели + исполнитель. */
  clientTools?: { defs: Block[]; run: (name: string, input: Record<string, unknown>) => Promise<string> };
  timeoutMs?: number;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  searches: number;
  requests: number;
  requestsWithSearch: number;
  /** Вызовы наших инструментов (бесплатные). */
  toolCalls: number;
}

export interface CallResult {
  text: string;
  thinkingChars: number;
  usage: Usage;
  ms: number;
  stopReason: string;
  /** Ссылки, которые вернул поиск (для проверки источников). */
  searchUrls: string[];
  raw: unknown[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(body: unknown, timeoutMs: number): Promise<any> {
  const key = apiKey();
  for (let attempt = 1; ; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= 3) throw new Error(`MiniMax HTTP ${res.status}: ${text.slice(0, 500)}`);
      await sleep(2000 * attempt);
    } finally {
      clearTimeout(t);
    }
  }
}

export function costUsd(u: Usage, searchBilling: "per-search" | "per-request" = "per-search"): number {
  const tokens = (u.input * PRICE.in + u.output * PRICE.out + u.cacheRead * PRICE.cacheRead) / 1e6;
  const search = (searchBilling === "per-search" ? u.searches : u.requestsWithSearch) * PRICE.search;
  return tokens + search;
}

export async function call(messages: Msg[], opts: CallOptions = {}): Promise<CallResult> {
  const started = Date.now();
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, requests: 0, requestsWithSearch: 0, toolCalls: 0 };
  const raw: unknown[] = [];
  const searchUrls: string[] = [];
  let text = "";
  let thinkingChars = 0;
  let stopReason = "";
  const convo = [...messages];
  for (let turn = 0; turn < 24; turn++) {
    const body: Record<string, unknown> = {
      model: opts.model ?? "MiniMax-M3.1-Flash",
      max_tokens: opts.maxTokens ?? 32000,
      output_config: { effort: opts.effort ?? "low" },
      messages: convo,
    };
    if (opts.system) body.system = opts.system;
    const budgetLeft = opts.maxSearches === undefined || usage.searches < opts.maxSearches;
    if (opts.search) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    if (opts.search && !budgetLeft) body.tool_choice = { type: "none" };
    if (opts.clientTools) body.tools = opts.clientTools.defs.map(({ type: _t, ...d }) => d);
    const res = await post(body, opts.timeoutMs ?? 300_000);
    raw.push(res);
    const u = res.usage ?? {};
    usage.input += u.input_tokens ?? 0;
    usage.output += u.output_tokens ?? 0;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    usage.requests += 1;
    const blocks: Block[] = res.content ?? [];
    let searchesHere = 0;
    for (const b of blocks) {
      if (b.type === "text") text += String(b.text ?? "");
      if (b.type === "thinking") thinkingChars += String(b.thinking ?? "").length;
      if (b.type === "server_tool_use") searchesHere++;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content as Block[]) if (typeof r.url === "string") searchUrls.push(r.url);
      }
    }
    const reported = u.server_tool_use?.web_search_requests;
    usage.searches += typeof reported === "number" ? reported : searchesHere;
    if (searchesHere > 0 || reported > 0) usage.requestsWithSearch += 1;
    stopReason = res.stop_reason ?? "";
    if (stopReason === "tool_use" && opts.clientTools) {
      convo.push({ role: "assistant", content: blocks });
      const results: Block[] = [];
      for (const b of blocks.filter((x) => x.type === "tool_use")) {
        usage.toolCalls++;
        const out = await opts.clientTools.run(String(b.name), (b.input ?? {}) as Record<string, unknown>);
        results.push({ type: "tool_result", tool_use_id: b.id, content: out });
      }
      convo.push({ role: "user", content: results });
      continue;
    }
    if (stopReason !== "pause_turn") break;
    const force = opts.maxSearches !== undefined && usage.searches >= opts.maxSearches;
    convo.push({ role: "assistant", content: force ? withoutDanglingSearch(blocks) : blocks });
    if (force) {
      convo.push({ role: "user", content: "Лимит поисков исчерпан. Больше не ищи — сразу ответь в требуемом формате по тому, что уже нашёл." });
    }
  }
  return { text, thinkingChars, usage, ms: Date.now() - started, stopReason, searchUrls, raw };
}

/** Пауза могла прийтись на середину поиска: вызов без результата нельзя оставлять перед нашей репликой. */
function withoutDanglingSearch(blocks: Block[]): Block[] {
  const answered = new Set(blocks.filter((b) => b.type === "web_search_tool_result").map((b) => b.tool_use_id));
  return blocks.filter((b) => b.type !== "server_tool_use" || answered.has(b.id));
}

export function fmtUsage(r: CallResult): string {
  const u = r.usage;
  const lo = costUsd(u, "per-request");
  const hi = costUsd(u, "per-search");
  const uah = (x: number) => (x * UAH_PER_USD).toFixed(2);
  return [
    `вход ${u.input} (кэш ${u.cacheRead}), выход ${u.output} (размышления ~${r.thinkingChars} симв.)`,
    `поисков MiniMax ${u.searches}, своих вызовов ${u.toolCalls}, запросов ${u.requests}, стоп ${r.stopReason}, ${(r.ms / 1000).toFixed(1)} с`,
    `цена $${lo.toFixed(4)}…$${hi.toFixed(4)} = ${uah(lo)}…${uah(hi)} грн`,
  ].join("\n");
}
