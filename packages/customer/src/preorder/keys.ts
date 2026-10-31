/**
 * Ключи запросов предзаказов. У приложений они исторически разные (инвалидации одного не должны задевать другое
 * место кэша), поэтому «мои места» и «товар» — по варианту на приложение; выровнять можно, когда экраны сольются.
 */
export const preorderKeys = {
  coming: ["preorders", "coming"] as const,
  /** Mini App: «мои места». */
  mineInApp: ["me", "preorders"] as const,
  /** Сайт: «мои места». */
  mineOnSite: ["preorders", "mine"] as const,
  /** Mini App: ключ включает признак входа, сайт — нет (там запрос включается только для вошедшего). */
  product: (id: string, signedIn?: boolean) =>
    signedIn === undefined ? (["preorders", "product", id] as const) : (["preorders", "product", id, signedIn] as const),
};
