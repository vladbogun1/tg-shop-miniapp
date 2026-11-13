/**
 * Получатель (прізвище, ім'я, по батькові — как в ТТН) и адрес курьера. Чистые правила без React.
 */

export interface Recipient {
  lastName: string;
  firstName: string;
  middleName: string;
}

export const EMPTY_RECIPIENT: Recipient = { lastName: "", firstName: "", middleName: "" };

/** «Іваненко Іван Петрович» → прізвище, ім'я, по батькові (порядок старого одного поля ПІБ). */
export function splitFullName(full: string | null | undefined): Recipient {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { lastName: parts[0] ?? "", firstName: parts[1] ?? "", middleName: parts.slice(2).join(" ") };
}

/** Получатель прошлого заказа: раздельные поля, если есть, иначе — разрезанное одно имя. */
export function recipientOfOrder(o: {
  customerName?: string | null;
  recipientLastName?: string | null;
  recipientFirstName?: string | null;
  recipientMiddleName?: string | null;
}): Recipient {
  if (o.recipientLastName && o.recipientFirstName) {
    return { lastName: o.recipientLastName, firstName: o.recipientFirstName, middleName: o.recipientMiddleName ?? "" };
  }
  return splitFullName(o.customerName);
}

export const NAME_PART_MIN = 2;

export function namePartOk(v: string): boolean {
  return v.trim().length >= NAME_PART_MIN;
}

// Нова пошта принимает имя только кириллицей («LastName has invalid characters», заказ #e6e83c17: «Курзiн» с
// латинской «i»). Латинский двойник кириллической буквы внутри кириллического слова сервер заменит сам; слово
// целиком латиницей — нет: его надо переписать. Без \p{…} и lookbehind — iOS 15.4 (docs/BROWSER-SUPPORT.md).
const LATIN_TWINS = "aceiopxykABCEHIKMOPTXY";
const CYRILLIC_TWINS = "асеіорхукАВСЕНІКМОРТХУ";
const CYRILLIC = /[\u0400-\u04FF]/;
const LATIN = /[A-Za-z]/;

/** «Курзiн» (латинская i) → «Курзін»; слово без кириллицы не трогаем. Так же делает сервер. */
export function fixLookalikes(v: string): string {
  return v
    .split(/([\s\-'ʼ’`]+)/)
    .map((word) => (CYRILLIC.test(word) ? word.replace(/[A-Za-z]/g, (c) => CYRILLIC_TWINS.charAt(LATIN_TWINS.indexOf(c)) || c) : word))
    .join("");
}

/** В части имени остались латинские буквы — Нова пошта не примет. */
export function namePartLatin(v: string): boolean {
  return LATIN.test(fixLookalikes(v));
}

export interface RecipientErrors {
  lastName: boolean;
  firstName: boolean;
  middleName: boolean;
  /** Ошибка — латиница (показываем сразу, не дожидаясь «Оформить»). */
  latin: { lastName: boolean; firstName: boolean; middleName: boolean };
}

const NO_LATIN = { lastName: false, firstName: false, middleName: false };

/** `latinAllowed` — самовывоз: ТТН нет, имя может быть любыми буквами. */
export function recipientErrors(r: Recipient, latinAllowed = false): RecipientErrors {
  const latin = latinAllowed
    ? NO_LATIN
    : { lastName: namePartLatin(r.lastName), firstName: namePartLatin(r.firstName), middleName: namePartLatin(r.middleName) };
  return {
    lastName: !namePartOk(r.lastName) || latin.lastName,
    firstName: !namePartOk(r.firstName) || latin.firstName,
    middleName: latin.middleName,
    latin,
  };
}

/** Показать ошибку обязательной части ФИО: латиницу — сразу, пустую — после «Оформить» или отказа сервера. */
export function namePartShown(e: RecipientErrors, part: "lastName" | "firstName", touched: boolean, serverRejected: boolean): boolean {
  return (touched && e[part]) || e.latin[part] || serverRejected;
}

export function recipientOk(r: Recipient, latinAllowed = false): boolean {
  const e = recipientErrors(r, latinAllowed);
  return !e.lastName && !e.firstName && !e.middleName;
}

/** Одна строка для сводки: «Прізвище Ім'я По батькові». */
export function recipientLine(r: Recipient): string {
  return [r.lastName, r.firstName, r.middleName].map((x) => x.trim()).filter(Boolean).join(" ");
}

/** `customerName` заказа: «Прізвище Ім'я» (так же его собирает сервер, если поле не прислали). */
export function recipientCustomerName(r: Recipient): string {
  return [r.lastName, r.firstName].map((x) => x.trim()).filter(Boolean).join(" ");
}

// ---- адрес курьера --------------------------------------------------------------------------

/** `streetRef` пустой, когда улицу вписали руками (поиск не нашёл) — сервер это принимает. */
export interface CourierAddress {
  streetRef: string;
  streetName: string;
  building: string;
  flat: string;
}

export const EMPTY_COURIER: CourierAddress = { streetRef: "", streetName: "", building: "", flat: "" };

export function courierErrors(a: CourierAddress): { street: boolean; building: boolean } {
  return { street: a.streetName.trim().length < 2, building: a.building.trim().length < 1 };
}

export function courierOk(a: CourierAddress): boolean {
  const e = courierErrors(a);
  return !e.street && !e.building;
}
