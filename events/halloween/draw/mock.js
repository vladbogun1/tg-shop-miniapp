// Fake participants for developing visuals without the server: ?mock=N
const FIRST = ["Олег", "Андрій", "Максим", "Ірина", "Влад", "Дмитро", "Катя", "Саша", "Богдан", "Настя",
  "Артем", "Денис", "Юля", "Ігор", "Марко", "Софія", "Тарас", "Ліза", "Nick", "Alex", "Денис", "Роман",
  "Вікторія", "Женя", "Павло", "Остап", "Даня", "Kyrylo", "Мирон", "Оля"];
const LAST = "АБВГДЕЖЗІКЛМНОПРСТУФХЦЧШ";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function mockParticipants(n, seed = 31) {
  const r = rng(seed);
  const list = [];
  for (let i = 0; i < n; i++) {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}.`;
    const pumpkins = r() < 0.7 ? 50 + Math.floor(r() * 30) : Math.floor(r() * 49);
    const orders = r() < 0.18 ? 1 + Math.floor(r() * (r() < 0.2 ? 3 : 1)) : 0;
    const via = [];
    if (pumpkins >= 50) via.push("pumpkins");
    if (orders > 0) via.push("orders");
    if (!via.length) { via.push("pumpkins"); }
    const tickets = (pumpkins >= 50 ? 1 : 0) + orders || 1;
    const hasAvatar = r() < 0.55;
    list.push({
      id: `m${i}`,
      name,
      handle: r() < 0.8 ? `@${name.slice(0, 3).toLowerCase()}***` : null,
      avatar: hasAvatar ? `https://i.pravatar.cc/96?u=hw${i}` : null,
      tickets,
      pumpkins: Math.max(pumpkins, via.includes("pumpkins") ? 50 : pumpkins),
      orders,
      via,
      won: false,
    });
  }
  return list;
}

/** Weighted pick, the same rule the server uses. */
export function mockDraw(list) {
  const pool = list.filter((p) => !p.won);
  const total = pool.reduce((s, p) => s + p.tickets, 0);
  let x = Math.random() * total;
  for (const p of pool) {
    if ((x -= p.tickets) < 0) return { winner: p, totalTickets: total };
  }
  return { winner: pool[pool.length - 1], totalTickets: total };
}
