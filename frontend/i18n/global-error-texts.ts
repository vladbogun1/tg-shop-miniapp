/**
 * Texts of the last-resort crash screen (app/global-error.tsx): the root providers crashed, so the
 * dictionaries are unavailable and the three languages live here.
 */
export const TEXTS = {
  uk: { title: "Щось пішло не так", text: "Застосунок не завантажився. Спробуйте ще раз.", retry: "Повторити" },
  ru: { title: "Что-то пошло не так", text: "Приложение не загрузилось. Попробуйте ещё раз.", retry: "Повторить" },
  en: { title: "Something went wrong", text: "The app failed to load. Please try again.", retry: "Retry" },
} as const;
