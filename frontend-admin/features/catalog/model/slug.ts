/**
 * Preview of the URL slug the backend will generate (SlugService.java) — same rules:
 * Ukrainian table when the text has і/ї/є/ґ, otherwise Russian; [a-z0-9-], ≤ 120 chars.
 * Only a hint for the admin: the server is the source of truth and adds -2, -3… on collisions.
 */
const RU: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  і: "i", ї: "yi", є: "ye", ґ: "g",
};

const UK: Record<string, string> = {
  ...RU,
  г: "h", ґ: "g", и: "y", і: "i", ї: "yi", й: "y", є: "ye", ё: "yo",
};

const MAX = 120;

export function slugify(text: string): string {
  if (!text || !text.trim()) return "";
  const lower = text.toLowerCase();
  const table = /[іїєґ]/.test(lower) ? UK : RU;
  let out = "";
  for (const ch of lower) {
    if (ch in table) out += table[ch];
    else if (ch === "'" || ch === "’" || ch === "ʼ" || ch === "`") continue;
    else if (ch === "+") out += "-plus-";
    else if (ch === "&") out += "-and-";
    else out += ch;
  }
  let slug = out
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > MAX) {
    let cut = slug.slice(0, MAX);
    const dash = cut.lastIndexOf("-");
    if (dash > MAX / 2) cut = cut.slice(0, dash);
    slug = cut.replace(/-+$/, "");
  }
  return slug;
}
