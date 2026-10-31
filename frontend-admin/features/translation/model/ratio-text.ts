/**
 * Отношение с двумя знаками после точки («1.50»), без `toFixed`: он в ратчете «деньги — через money()», а здесь не деньги.
 * Округление то же, что у `Number.prototype.toFixed(2)`: по точному значению double, при равенстве — к большему.
 * Точное значение берётся из битов числа (мантисса · 2^степень), всё считается в BigInt.
 */
export function ratioText(r: number): string {
  if (!Number.isFinite(r) || r < 0) return String(r);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, r);
  const bits = view.getBigUint64(0);
  const exp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & 0xfffffffffffffn;
  const mant = exp === 0 ? frac : frac | (1n << 52n);
  const pow = (exp === 0 ? 1 : exp) - 1075; // r = mant · 2^pow
  const scaled = 100n * mant;
  const cents = pow >= 0 ? scaled << BigInt(pow) : (scaled * 2n + (1n << BigInt(-pow))) / (2n << BigInt(-pow));
  const text = cents.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}
