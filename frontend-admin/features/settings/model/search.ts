/**
 * Поиск по настройкам. Подписи то русские, то украинские, поэтому сравниваем «сложенные» строки:
 * «пошта» находит «почта», «і/ї/и/ы» и «є/е/ё» считаются одной буквой.
 */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[іїы]/g, "и")
    .replace(/є/g, "е")
    .replace(/пошт/g, "почт");
}

/** Совпадает ли настройка с поиском (подпись, описание, ключ). */
export function matchesQuery(parts: Array<string | null | undefined>, query: string): boolean {
  const q = fold(query.trim());
  return q === "" || parts.some((p) => fold(p ?? "").includes(q));
}
