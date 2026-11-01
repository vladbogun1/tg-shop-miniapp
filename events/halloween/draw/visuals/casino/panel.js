// The panel under the table of «Рулетка»: before a spin it walks over the numbers and shows who stands on
// the lit one; during a spin it shows the prize and what the croupier is doing.
import { t, plural } from "../../lang.js";
import { colorOf, FILL } from "./wheel.js";

export const PN = { x: 892, y: 744, w: 1012, h: 292 };

export function makePanel({ px, table }) {
  const { PAL } = px;
  let line = "", lineAt = 0, prize = null;
  const players = (n) => plural(n, t(["гравець", "гравці", "гравців"], ["игрок", "игрока", "игроков"]));

  function numTile(g, n, x, y, s = 52) {
    px.box(g, x, y, s, s, { frame: PAL.gold, fill: FILL[colorOf(n)], shadow: false });
    px.text(g, String(n), x + s / 2, y + s / 2 + 2, { size: Math.round(s * 0.6), color: PAL.bone, align: "center", depth: 3 });
  }

  function drawIdle(g, { cells, spot, pool }) {
    const { x, y, w } = PN;
    const tickets = pool.reduce((s, p) => s + p.tickets, 0);
    px.text(g, `${t("ГРАВЦІВ", "ИГРОКОВ")} ${pool.length}  ·  ${t("КВИТКІВ", "БИЛЕТОВ")} ${tickets}`, x + w - 28, y + 40, { size: 22, color: PAL.amber, align: "right", depth: 2 });
    const cell = spot != null ? cells.get(spot) : null;
    if (!cell) { px.text(g, t("РОБІТЬ СТАВКИ", "ДЕЛАЙТЕ СТАВКИ"), x + 28, y + 40, { size: 32, color: PAL.gold, depth: 3 }); return; }
    numTile(g, spot, x + 28, y + 18);
    px.text(g, `${cell.people.length} ${players(cell.people.length)}`, x + 100, y + 46, { size: 28, color: PAL.gold, depth: 3 });
    const colW = (w - 56) / 2, rowH = 46, show = cell.people.slice(0, 8);
    show.forEach((p, i) => {
      const cx = x + 28 + (i % 2) * colW, cy = y + 110 + Math.floor(i / 2) * rowH;
      table.chip(g, p, cx + 18, cy, 17);
      const name = p.name || "?";
      px.text(g, name, cx + 46, cy + 2, { size: px.fit(g, name, 26, colW - 130), color: PAL.bone, depth: 2 });
      px.text(g, `×${p.tickets}`, cx + colW - 20, cy + 2, { size: 22, color: PAL.amber, align: "right", depth: 2 });
    });
    const rest = cell.people.length - show.length;
    if (rest > 0) px.text(g, t(`+ ЩЕ ${rest} НА ЦЬОМУ ЧИСЛІ`, `+ ЕЩЕ ${rest} НА ЭТОМ ЧИСЛЕ`), x + w / 2, y + PN.h - 18, { size: 18, color: PAL.violet, align: "center", depth: 2 });
  }

  function drawRoll(g, now, { roll }) {
    const { x, y, w, h } = PN, pr = roll?.info?.prize || prize;
    let tx = x + 28;
    if (roll?.pic && px.ready(roll.pic.img)) {
      const [pw, ph] = px.prizePictureSize(roll.pic, 220);
      px.prizeFrame(g, roll.pic, x + 24, y + h - ph - 24, pw, ph);
      tx = x + 24 + pw + 32;
    }
    const maxW = x + w - 28 - tx;
    px.text(g, t("РОЗІГРУЄМО", "РАЗЫГРЫВАЕМ"), tx, y + 40, { size: 24, color: PAL.amber, depth: 2, ls: 3 });
    if (pr?.name) {
      const n = px.prizeLabel(pr.name);
      px.text(g, n, tx, y + 94, { size: px.fit(g, n, 42, maxW), color: PAL.gold, depth: 4, drop: PAL.rust });
    }
    if (line) {
      const blink = now - lineAt < 1.2 ? Math.floor(now * 8) % 2 : 1;
      if (blink) px.text(g, line, tx, y + 190, { size: px.fit(g, line, 54, maxW), color: PAL.orange, depth: 4 });
    }
  }

  return {
    numTile,
    say(s) { if (s !== line) { line = s; lineAt = performance.now() / 1000; } },
    setPrize(p) { prize = p; },
    draw(g, now, st) {
      if (st.mode === "win") return;
      px.box(g, PN.x, PN.y, PN.w, PN.h, { frame: st.mode === "idle" ? PAL.violet : PAL.orange });
      if (st.mode === "idle") drawIdle(g, st); else drawRoll(g, now, st);
    },
  };
}
