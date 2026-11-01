import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HW_DATA_DIR = mkdtempSync(join(tmpdir(), "hw-contact-"));
process.env.HW_BOT_TOKEN = "t";
process.env.HW_BACKEND_URL = "http://backend.test";
const prizes = await import("../src/prizes.js");
const contact = await import("../src/contact.js");

const calls = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url: String(url), body });
  if (String(url).includes("api.telegram.org")) return Response.json({ ok: true, result: { message_id: 77 } });
  return Response.json({ id: "thread-1" });
};

test("the card keeps its blank lines and names the deadline in Kyiv time", () => {
  const at = Date.UTC(2026, 10, 1, 19, 47); // 21:47 Kyiv
  const text = prizes.render(prizes.template(), { name: "Оля", round: 4, pool: "pumpkins", prize: { name: "Мишка", items: ["A", "B"] }, deadline: { at, minutes: 3 } });
  assert.match(text, /до 21:47 за Києвом \(3 хв\)/);
  assert.match(text, /🎁 Твій приз: Мишка\n• A\n• B\n\n⏳/);
});

test("a customised template without {deadline} still gets the deadline line", () => {
  const text = prizes.render("Привіт, {name}", { name: "X", round: 1, pool: "orders", deadline: { at: Date.UTC(2026, 10, 1, 20, 0), minutes: 2 } });
  assert.equal(text, "Привіт, X\n\n⏳ Відповідь чекаємо до 22:00 за Києвом (2 хв). Якщо не встигнеш, приз розіграємо ще раз.");
});

test("send: card from the bot, short line into the chat; a reroll edits the card and writes into the chat once", async () => {
  calls.length = 0;
  const deadline = contact.deadlineFor("pumpkins", 2, false);
  await contact.send({ token: "adm", by: "1", tgId: "555", drawId: 9, pool: "pumpkins", round: 2, test: false, text: "КАРТКА\n\nрядок", deadline });
  assert.equal(calls[0].body.text, "КАРТКА\n\nрядок");
  assert.match(calls[1].url, /\/api\/admin\/support\/threads$/);
  assert.match(calls[1].body.text, /^🎃 Перемога в Хелловін-розіграші \(розіграш за гарбузи, раунд 2\)/);

  calls.length = 0;
  await contact.expire({ token: "adm", pool: "pumpkins", round: 2, test: false });
  assert.match(calls[0].url, /editMessageText$/);
  assert.equal(calls[0].body.message_id, 77);
  assert.match(calls[1].url, /\/threads\/thread-1\/messages$/);
  assert.match(calls[1].body.text, /^⌛ Час на відповідь вийшов/);

  calls.length = 0;
  await contact.expire({ token: "adm", pool: "pumpkins", round: 2, test: false });
  assert.equal(calls.length, 0);
});
