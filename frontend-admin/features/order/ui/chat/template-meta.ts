/** Подписи языков и подстановки шаблонов ответов. */
export const LOCALE_LABEL = { ru: "рус", uk: "укр", en: "eng" } as const;

export const PLACEHOLDERS: { key: string; hint: string }[] = [
  { key: "{name}", hint: "ФИО клиента" },
  { key: "{orderNo}", hint: "номер заказа" },
  { key: "{total}", hint: "сумма заказа" },
  { key: "{cod}", hint: "наложка" },
  { key: "{ttn}", hint: "ТТН" },
  { key: "{warehouse}", hint: "город и отделение" },
];
