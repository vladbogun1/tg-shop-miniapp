// The language of the OBS scene: the remote picks Ukrainian or Russian (show state `lang`, server/src/show.js),
// stage.js sets it before drawing anything and remounts the visual when it changes. Strings stay next to
// their use as pairs: t("Переможець", "Победитель"). The old screen /hw/draw/ stays Ukrainian.
let lang = "uk";

export const setLang = (l) => (lang = l === "ru" ? "ru" : "uk");
export const getLang = () => lang;
export const t = (uk, ru) => (lang === "ru" ? ru : uk);

/** Slavic plural: forms = [1, 2–4, 5+] («квиток / квитки / квитків»). */
export function plural(n, forms) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return forms[0];
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return forms[1];
  return forms[2];
}

/** «квиток» in the scene's language. */
export const ticketsWord = (n) => plural(n, t(["квиток", "квитки", "квитків"], ["билет", "билета", "билетов"]));
