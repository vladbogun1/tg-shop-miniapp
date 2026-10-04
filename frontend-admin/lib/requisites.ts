/**
 * Client-side checks of the shop requisites (the backend repeats them — PaymentRequisitesRules).
 * A typo in the card or IBAN means customers pay into an account that does not exist.
 */

const digits = (s: string) => s.replace(/[\s-]/g, "");

/** Card: 13–19 digits passing Luhn. Blank is allowed (no card). */
export function cardProblem(card: string | null | undefined): string | null {
  const d = digits(card ?? "");
  if (!d) return null;
  if (!/^\d{13,19}$/.test(d)) return "Номер карты — 16 цифр (допустимо 13–19)";
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0 ? null : "Номер карты с ошибкой (не прошёл проверку Luhn)";
}

/** UA IBAN: "UA" + 27 digits with a valid mod-97 checksum. Blank is allowed. */
export function ibanProblem(iban: string | null | undefined): string | null {
  const s = (iban ?? "").replace(/\s/g, "").toUpperCase();
  if (!s) return null;
  if (!/^UA\d{27}$/.test(s)) return "IBAN: UA и 27 цифр (29 символов)";
  const rearranged = s.slice(4) + s.slice(0, 4);
  let numeric = "";
  for (const c of rearranged) numeric += /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c;
  let rem = 0;
  for (const c of numeric) rem = (rem * 10 + (c.charCodeAt(0) - 48)) % 97;
  return rem === 1 ? null : "IBAN с ошибкой (не сходится контрольная сумма)";
}
