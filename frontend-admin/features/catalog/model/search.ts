/** Нормализация текста для поиска по справочнику: нижний регистр, «ё» = «е». */
export const normText = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
