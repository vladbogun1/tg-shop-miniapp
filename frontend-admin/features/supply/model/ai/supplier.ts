/** Поставщик из документа ИИ → наш поставщик. Чистая логика. */

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Короче — слишком общее («A», «Shop»): по вхождению не сопоставляем, только точно. */
const MIN_CONTAINS = 4;

/**
 * Id поставщика (строкой) или "". Точное совпадение названия, иначе вхождение одного в другое, если более короткое
 * не меньше 4 знаков: «Zpmax准枪电竞外设企业店» со скрина = наш «Taobao Zpmax准枪电竞外设企业店».
 */
export function supplierByName(list: readonly { id: number; name: string }[] | undefined, name: string | null): string {
  if (!list || !name) return "";
  const n = norm(name);
  if (!n) return "";
  const exact = list.find((s) => norm(s.name) === n);
  if (exact) return String(exact.id);
  const hit = list.find((s) => {
    const m = norm(s.name);
    const shorter = m.length < n.length ? m : n;
    return shorter.length >= MIN_CONTAINS && (m.includes(n) || n.includes(m));
  });
  return hit ? String(hit.id) : "";
}
