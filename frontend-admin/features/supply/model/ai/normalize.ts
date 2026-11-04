/** Нормализация текста строк: ключ памяти поставщика и слова для поиска по каталогу. Чистая логика. */

/** Ключ памяти поставщика: текст строки + вариант, нижний регистр, одиночные пробелы, ≤ 255 символов. */
export function sourceKey(text: string, variant: string | null): string {
  const joined = variant ? `${text} | ${variant}` : text;
  return joined.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 255);
}

/** Слова латиницей и цифрами для поиска: «ZP1 Advanced 490*420» → ["zp1", "advanced", "490", "420"]. */
export function words(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-z0-9а-яіїєґ+]+/i)
    .filter((w) => w.length > 0);
}
