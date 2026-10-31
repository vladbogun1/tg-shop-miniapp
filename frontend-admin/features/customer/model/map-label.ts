/**
 * Подпись на маркере карты посетителей: «7», «1.2k», «15k». Число посетителей — не деньги.
 * Для [1000; 10000) раньше было `(n / 1000).toFixed(1)`; `toPrecision(2)` на числах от 1 до 10 даёт
 * то же самое (оба берут ближайшее к точному значению double, при равенстве — большее), кроме
 * «10», которое достраиваем до «10.0».
 */
export function countLabel(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) {
    const text = (n / 1000).toPrecision(2);
    return `${text.includes(".") ? text : `${text}.0`}k`;
  }
  return String(n);
}
