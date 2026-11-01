// The scoreboard of «Лото Забава» (bottom right): before a roll it maps ball numbers to names, a page at a
// time, and lights one ball up in turn; during a roll it shows the lot and what is happening.
import { t } from "../../lang.js";
export function makeBoard({ px, art }) {
  const { PAL } = px;
  const X = 1150, Y = 770, BW = 730, BH = 274;
  const PER = 8, PAGE_S = 6, SPOT_S = 0.75;
  let page = [], pageNo = 0, pageAt = 0, spotI = 0, spotAt = 0;
  let line = "", lineAt = 0, prize = null;

  function tick(now, balls, mode) {
    if (mode !== "idle") return;
    const sorted = balls.slice().sort((a, b) => b.r - a.r || a.num - b.num);
    const pages = Math.max(1, Math.ceil(sorted.length / PER));
    if (now > pageAt) { pageAt = now + PAGE_S; pageNo = (pageNo + 1) % pages; spotI = 0; }
    page = sorted.slice((pageNo % pages) * PER, (pageNo % pages) * PER + PER);
    if (now > spotAt) { spotAt = now + SPOT_S; spotI = (spotI + 1) % Math.max(1, page.length); }
  }

  function drawIdle(g, now, { pool }) {
    const tickets = pool.reduce((s, p) => s + p.tickets, 0);
    px.text(g, "ТАБЛО", X + 28, Y + 34, { size: 30, color: PAL.orange, ls: 4, depth: 3 });
    const info = `${t("УЧАСНИКІВ", "УЧАСТНИКОВ")} ${pool.length}  ·  ${t("КВИТКІВ", "БИЛЕТОВ")} ${tickets}`;
    px.text(g, info, X + BW - 28, Y + 34, { size: 24, color: PAL.amber, align: "right", depth: 2 });
    const colW = (BW - 56) / 2, rowH = 46;
    page.forEach((b, i) => {
      const col = i % 2, row = (i / 2) | 0, x = X + 28 + col * colW, y = Y + 92 + row * rowH;
      const on = i === spotI;
      if (on) { g.fillStyle = "rgba(255,211,107,.16)"; g.fillRect(x - 8, y - rowH / 2 + 4, colW - 8, rowH - 8); }
      art.drawBall(g, b, x + 22, y, { scale: 21 / b.r });
      const name = b.p.name || "?", nameW = colW - 150;
      px.text(g, name, x + 54, y + 2, { size: px.fit(g, name, 26, nameW), color: on ? PAL.gold : PAL.bone, depth: 2 });
      px.text(g, `×${b.p.tickets}`, x + colW - 22, y + 2, { size: 22, color: PAL.amber, align: "right", depth: 2 });
    });
    const rest = pool.length - Math.min(pool.length, 40);
    if (rest > 0) px.text(g, t(`+ ЩЕ ${rest} ЧЕКАЮТЬ СВОЄЇ КУЛЬКИ`, `+ ЕЩЕ ${rest} ЖДУТ СВОЙ ШАР`), X + BW / 2, Y + BH - 18, { size: 18, color: PAL.violet, align: "center", depth: 2 });
  }

  function drawRoll(g, now, { roll }) {
    const pr = roll?.info?.prize || prize;
    let tx = X + 28;
    if (roll?.pic && px.ready(roll.pic.img)) {
      const [pw, ph] = px.prizePictureSize(roll.pic, 200);
      px.prizeFrame(g, roll.pic, X + 24, Y + BH - ph - 24, pw, ph);
      tx = X + 24 + pw + 32;
    }
    const maxW = X + BW - 28 - tx;
    px.text(g, t("РОЗІГРУЄМО", "РАЗЫГРЫВАЕМ"), tx, Y + 40, { size: 24, color: PAL.amber, depth: 2, ls: 3 });
    if (pr?.name) {
      const n = px.prizeLabel(pr.name);
      px.text(g, n, tx, Y + 92, { size: px.fit(g, n, 40, maxW), color: PAL.gold, depth: 4, drop: PAL.rust });
    }
    if (line) {
      const blink = now - lineAt < 1.2 ? Math.floor(now * 8) % 2 : 1;
      if (blink) px.text(g, line, tx, Y + 176, { size: px.fit(g, line, 52, maxW), color: PAL.orange, depth: 4 });
    }
  }

  return {
    tick,
    /** The ball the board points at right now (it gets a gold ring in the drum). */
    spot: () => page[spotI] ?? null,
    say(t) { if (t !== line) { line = t; lineAt = performance.now() / 1000; } },
    setPrize(p) { prize = p; },
    draw(g, now, s) {
      if (s.mode === "win") return;
      px.box(g, X, Y, BW, BH, { frame: s.mode === "idle" ? PAL.violet : PAL.orange });
      if (s.mode === "idle") drawIdle(g, now, s); else drawRoll(g, now, s);
    },
  };
}
