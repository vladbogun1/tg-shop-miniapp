// Puts the pack scene (draw/assets/prizes/<name>.webp, drawn for the promo posters) first in every prize that has
// more than one thing in it, so the remote and the OBS scene show the whole pack, not only the first product.
// Picks the scene by what the pack contains, so prize ids do not matter. Idempotent.
//   node tools/pack-pictures.mjs <base> <admin token> [--dry]
//   base: http://localhost:3051 locally, https://admin.chisetup.com.ua on prod
const [base, token, dry] = process.argv.slice(2);
if (!base || !token) throw new Error("usage: node tools/pack-pictures.mjs <base> <token> [--dry]");

/** First rule whose words are all in the pack's contents wins. */
const RULES = [
  ["buy-1", ["Slicker Pro"]],
  ["buy-2", ["MCHOSE"]],
  ["buy-3", ["Dragonfly"]],
  ["buy-4", ["Аніме-дівчина"]],
  ["hunt-1", ["Attack Shark"]],
  ["hunt-2", ["Кейкапи топографічні"]],
  ["hunt-3", ["Proove Bliss білі"]],
  ["camo-orange", ["камуфляж", "помаранчевий"]],
  ["wave-white", ["чорна хвиля", "Рукав ROCKBROS білий"]],
  ["wave-black", ["чорна хвиля", "Рукав ROCKBROS чорний"]],
];

const api = async (path, body) => {
  const r = await fetch(`${base}/hw/api/admin/${path}?pool=pumpkins`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
};

const { prizes } = await api("prizes");
for (const p of prizes) {
  if (p.items.length < 2) continue;
  const text = p.items.join(" | ");
  const set = RULES.find(([, words]) => words.every((w) => text.toLowerCase().includes(w.toLowerCase())))?.[0];
  if (!set) {
    console.log(`#${p.id} ${p.name}: no scene, left as is`);
    continue;
  }
  const images = [`sets/${set}`, ...p.images.filter((k) => !k.startsWith("sets/"))].slice(0, 6);
  if (images.join() === p.images.join()) {
    console.log(`#${p.id} ${p.name}: already ${set}`);
    continue;
  }
  console.log(`#${p.id} ${p.name}: → ${set}${dry ? " (dry)" : ""}`);
  if (!dry) await api("prizes", { id: p.id, name: p.name, items: p.items, images });
}
