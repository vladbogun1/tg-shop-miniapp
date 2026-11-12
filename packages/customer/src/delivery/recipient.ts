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

export function recipientErrors(r: Recipient): { lastName: boolean; firstName: boolean } {
  return { lastName: !namePartOk(r.lastName), firstName: !namePartOk(r.firstName) };
}

export function recipientOk(r: Recipient): boolean {
  const e = recipientErrors(r);
  return !e.lastName && !e.firstName;
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
