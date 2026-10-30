// One row per person of the event for the shop admin's participants page: pumpkins, purchases, the
// earlier-customer invite and what the bot broadcast got back. Pure (no database), so it is tested
// on its own; members.js gathers the inputs.

/**
 * @param {object} i
 * @param {Map<string,{n:number,days:number,first:number,last:number}>} i.pumpkins  collected per person
 * @param {Map<string,{n:number,spendMinor:number}>} i.orders  orders inside the window
 * @param {Map<string,number>} i.old  earlier customers → spend before the event
 * @param {Array<{tgId:string,tickets:number}>} i.pumpkinPool  live pumpkin draw (excluded people are not in it)
 * @param {Array<{tgId:string,tickets:number}>} i.orderPool  live purchase draw
 * @param {Map<string,{state:string,joinedAt:number|null,via:string|null}>} i.invites  earlier customers' invite state
 * @param {Map<string,{status:string,at:number}>} i.restSends  the «everyone else» broadcast
 * @param {Map<string,string>} i.excluded  tgId → note
 * @param {Set<string>} i.staff
 */
export function buildRows(i) {
  const ids = new Set([...i.pumpkins.keys(), ...i.orders.keys(), ...i.old.keys()]);
  const pTickets = new Map(i.pumpkinPool.map((e) => [e.tgId, e.tickets]));
  const oTickets = new Map(i.orderPool.map((e) => [e.tgId, e.tickets]));
  const pTotal = sum(i.pumpkinPool), oTotal = sum(i.orderPool);
  const rows = [];
  for (const tgId of ids) {
    if (i.staff.has(tgId)) continue;
    const p = i.pumpkins.get(tgId), o = i.orders.get(tgId), inv = i.invites.get(tgId), rest = i.restSends.get(tgId);
    const pt = pTickets.get(tgId) || 0, ot = oTickets.get(tgId) || 0;
    rows.push({
      tgId,
      pumpkins: p?.n || 0,
      pumpkinDays: p?.days || 0,
      lastPumpkinAt: p?.last || null,
      pumpkinTickets: pt,
      pumpkinChance: pTotal ? pt / pTotal : 0,
      orders: o?.n || 0,
      spendMinor: o?.spendMinor || 0,
      orderTickets: ot,
      orderChance: oTotal ? ot / oTotal : 0,
      old: i.old.has(tgId),
      oldSpendMinor: i.old.get(tgId) || 0,
      invite: inv?.state || null,
      joinedAt: inv?.joinedAt || null,
      // the broadcast this person got: the invite (earlier customers) or the «everyone else» one
      broadcast: inv ? inviteBroadcast(inv.state) : rest?.status || null,
      broadcastAt: rest?.at || inv?.sentAt || null,
      excluded: i.excluded.has(tgId) ? i.excluded.get(tgId) || "" : null,
    });
  }
  return rows;
}

const sum = (pool) => pool.reduce((s, e) => s + e.tickets, 0);

/** invite state → what the broadcast got back (joined/grey = delivered). */
function inviteBroadcast(state) {
  if (state === "joined" || state === "grey") return "ok";
  if (state === "blocked" || state === "error") return state;
  return null;
}

/** Numbers above the table. */
export function summarize(rows, goal) {
  const n = (f) => rows.filter(f).length;
  return {
    total: rows.length,
    pumpkinPeople: n((r) => r.pumpkinTickets > 0),
    pumpkinsCollected: rows.reduce((s, r) => s + r.pumpkins, 0),
    fullSets: n((r) => r.pumpkinTickets > 0 && r.pumpkins >= goal),
    orderPeople: n((r) => r.orderTickets > 0),
    spendMinor: rows.reduce((s, r) => s + r.spendMinor, 0),
    oldTotal: n((r) => r.old),
    oldJoined: n((r) => r.invite === "joined"),
    oldGrey: n((r) => r.invite === "grey"),
    blocked: n((r) => r.broadcast === "blocked"),
    excluded: n((r) => r.excluded !== null),
  };
}
