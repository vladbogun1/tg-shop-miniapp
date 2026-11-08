#!/usr/bin/env node
/**
 * Stand-in for the model endpoint (MiniMax through its Anthropic-compatible API): the backend's
 * AI_MINIMAX_BASE_URL points here, so no real model is ever called.
 *
 * What the backend sees: POST /v1/messages → an Anthropic-shaped answer. The product id the prompt asks about
 * is read from the prompt itself (the JSON of the card prompt has a key "p<hex>"), and the answer is a card with a
 * new Russian description plus its translations, in a ```json block.
 *
 * A translation prompt (it has «Строки для перевода») is answered with uk/en for every id it asks about.
 * The supply match prompt (step 2) takes the first candidate of every line, or a new product without candidates.
 *
 * What a test drives (control API, /__e2e/*, JSON):
 *   POST /__e2e/mode {mode: "normal"|"bad"|"error"|"research", matchMode?, delayMs?, description?, photos?}
 *        matchMode — the mode for the supply match prompt only (null — the same as mode);
 *        normal — a good answer; bad — text without JSON (the job ends BAD_ANSWER); error — HTTP 500 (FAILED);
 *        research — the first turn asks for the «search» tool (the job writes the step «Ищу: …», then
 *        «Разбираю найденное»), the next turn is the good answer plus `photos`; delayMs then holds only that next
 *        turn, so the progress sheet is caught on the research stage;
 *        delayMs — the answer comes that much later (to catch the job while it runs);
 *        description — the text of the new description (default "E2E-ИИ: описание");
 *        photos — links put into the answer's "photos" (research mode only).
 *   GET  /__e2e/requests — how many /v1/messages calls came, and the product ids found in them (a match call: its lines)
 *   POST /__e2e/reset — normal mode, no delay, forgets the requests
 */
import http from "node:http";

const port = Number(process.env.E2E_FAKE_AI_PORT || 18191);

const state = { mode: "normal", matchMode: null, delayMs: 0, description: "E2E-ИИ: описание", photos: [], calls: [] };

function reset() {
  Object.assign(state, { mode: "normal", matchMode: null, delayMs: 0, description: "E2E-ИИ: описание", photos: [], calls: [] });
}

function promptText(body) {
  const parts = [];
  for (const m of body?.messages ?? []) {
    for (const b of m.content ?? []) if (b?.type === "text") parts.push(b.text);
  }
  return parts.join("\n");
}

/** The translation prompt (Э5): the strings to translate are the JSON block after «Строки для перевода». */
function translationAnswer(text) {
  const tail = text.slice(text.indexOf("Строки для перевода"));
  const block = /```json\n([\s\S]*?)\n```/.exec(tail)?.[1];
  let input = {};
  try {
    input = JSON.parse(block ?? "{}");
  } catch {
    input = {};
  }
  const out = {};
  for (const [id, v] of Object.entries(input)) {
    const ru = String(v?.ru ?? "");
    // no ы э ъ ё in the Ukrainian text, or the server check rejects it
    const uk = "UK: " + ru.replace(/[ыЫ]/g, "и").replace(/[эЭ]/g, "е").replace(/[ёЁ]/g, "е").replace(/[ъЪ]/g, "");
    out[id] = { ru, uk, en: "EN: " + ru };
  }
  return { id: Object.keys(out).join(","), text: "```json\n" + JSON.stringify(out, null, 2) + "\n```" };
}

function answerFor(text) {
  if (text.includes("помощник закупщика")) return supplyAnswer();
  if (text.includes("не смог уверенно сопоставить")) return matchAnswer(text);
  if (text.includes("Строки для перевода")) return translationAnswer(text);
  // Ключ товара — из блока «## Товары»: в инструкции промпта нового товара выше есть пример ("p0a1b2c3d"), он не наш.
  const products = text.slice(Math.max(0, text.indexOf("## Товары")));
  const id = /"(p[0-9a-f]{8,32})"\s*:/.exec(products)?.[1] ?? null;
  const d = state.description;
  const card = {
    overall: 90,
    description: { ru: d, uk: `${d} (uk)`, en: `${d} (en)` },
    sources: ["https://example.com/spec"],
    notes: "e2e",
  };
  return { id, text: "```json\n" + JSON.stringify({ [id ?? "p00000000"]: card }, null, 2) + "\n```" };
}

/** The supply prompt (Э6): a screenshot of an order with six lines; the sum of the lines equals the total. */
function supplyAnswer() {
  const lines = [
    { text: "Коврик для мыши XL", qty: 1, unitPrice: 12.5 },
    { text: "Кабель USB-C 1м", qty: 2, unitPrice: 3 },
    { text: "Глайды для мыши", qty: 3, unitPrice: 2 },
    { text: "Грипсы чёрные", qty: 1, unitPrice: 4.5 },
    { text: "Кейкапы PBT", qty: 1, unitPrice: 18 },
    { text: "Переключатели 70 шт", qty: 1, unitPrice: 21 },
  ];
  const total = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const doc = { supplier: "E2E Shop", currency: "CNY", total, lines };
  return { id: "supply", text: "```json\n" + JSON.stringify(doc, null, 2) + "\n```" };
}

/**
 * The supply step 2 prompt: a line with a search hint takes the first hinted product (and its first variant, read from
 * the catalog block — the hint lists only key and title), a line without hints becomes a new product in the first
 * category of the list. Catalog groups are "### <category>" blocks too; they have no "L<n>:" and are skipped.
 */
function matchAnswer(text) {
  const category = /^- ([a-z0-9-]+) — /m.exec(text)?.[1] ?? null;
  const out = {};
  for (const block of text.split(/^### /m).slice(1)) {
    const id = /^(L\d+):/.exec(block)?.[1];
    if (!id) continue;
    const cand = /^- (p[0-9a-f]{8}) \| (.*)$/m.exec(block);
    if (cand) {
      const catalogLine = new RegExp(`^- ${cand[1]} \\| (.*)$`, "m").exec(text)?.[1] ?? "";
      const variants = /варианты: ([^|]*)/.exec(catalogLine)?.[1];
      out[id] = { product: cand[1], variant: variants ? variants.split(", ")[0].trim() : null, notes: null };
    } else {
      const title = block.split("\n")[0].replace(/^L\d+:\s*/, "");
      out[id] = { new: { title: `E2E ${title}`, variant: null, brand: "E2E", category, source: null }, notes: "e2e: новый товар" };
    }
  }
  return { id: "supply-match", lines: Object.keys(out), text: "```json\n" + JSON.stringify(out, null, 2) + "\n```" };
}

function reply(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

async function control(req, res, url) {
  if (req.method === "POST" && url.pathname === "/__e2e/mode") {
    const b = await readBody(req);
    if (b.mode) state.mode = b.mode;
    if (b.matchMode !== undefined) state.matchMode = b.matchMode;
    if (typeof b.delayMs === "number") state.delayMs = b.delayMs;
    if (typeof b.description === "string") state.description = b.description;
    if (Array.isArray(b.photos)) state.photos = b.photos;
    return reply(res, 200, { ...state, calls: state.calls.length });
  }
  if (req.method === "GET" && url.pathname === "/__e2e/requests") return reply(res, 200, state.calls);
  if (req.method === "POST" && url.pathname === "/__e2e/reset") {
    reset();
    return reply(res, 200, {});
  }
  return reply(res, 404, { error: "unknown control call" });
}

async function messages(req, res) {
  const body = await readBody(req);
  if (state.mode === "research") return research(body, res);
  const out = answerFor(promptText(body));
  const mode = out.id === "supply-match" && state.matchMode ? state.matchMode : state.mode;
  state.calls.push({ id: out.id, mode, ...(out.lines ? { lines: out.lines } : {}) });
  if (state.delayMs > 0) await new Promise((r) => setTimeout(r, state.delayMs));
  if (mode === "error") return reply(res, 500, { error: { message: "e2e: model failed" } });
  const text = mode === "bad" ? "Не могу найти эту модель, ответ без данных." : out.text;
  return reply(res, 200, {
    id: "msg_e2e",
    type: "message",
    role: "assistant",
    model: "e2e",
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 1000, output_tokens: 300 },
  });
}

function modelReply(res, content) {
  return reply(res, 200, {
    id: "msg_e2e",
    type: "message",
    role: "assistant",
    model: "e2e",
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
    content,
    usage: { input_tokens: 1000, output_tokens: 300 },
  });
}

/** «research» mode: the first turn (one message, tools offered) asks to search; the next turn answers with photos. */
async function research(body, res) {
  const text = promptText(body);
  const first = (body?.messages ?? []).length === 1 && (body?.tools ?? []).length > 0;
  if (first) {
    state.calls.push({ id: null, mode: "research:search" });
    return modelReply(res, [{ type: "tool_use", id: "toolu_e2e_1", name: "search", input: { query: "e2e scarf specs" } }]);
  }
  const out = answerFor(text);
  state.calls.push({ id: out.id, mode: "research:answer" });
  if (state.delayMs > 0) await new Promise((r) => setTimeout(r, state.delayMs));
  const card = JSON.parse(out.text.slice(out.text.indexOf("{"), out.text.lastIndexOf("}") + 1));
  for (const v of Object.values(card)) v.photos = state.photos;
  return modelReply(res, [{ type: "text", text: "```json\n" + JSON.stringify(card, null, 2) + "\n```" }]);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/__e2e/")) return control(req, res, url);
    if (req.method === "POST" && url.pathname === "/v1/messages") return messages(req, res);
    return reply(res, 200, {});
  })
  .listen(port, () => console.log(`fake-ai on :${port}`));
