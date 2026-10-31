/** «Добавить опцию в схему»: полный список опций атрибута с новой опцией в конце (PATCH заменяет список целиком). */
import type { CardAttribute } from "./schema";
import type { SpecOptionWrite } from "./wire";

export interface NewOption {
  value: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
  /** Алиасы через запятую или с новой строки. */
  aliases: string;
}

export function optionsWithNew(attr: CardAttribute, o: NewOption): SpecOptionWrite[] {
  const labelRu = o.labelRu.trim();
  const aliases = o.aliases
    .split(/\n|,/)
    .map((a) => a.trim())
    .filter(Boolean)
    .join("\n");
  return [
    ...attr.options.map((x) => ({
      value: x.value,
      labelRu: x.labelRu,
      labelUk: x.labelUk ?? x.labelRu,
      labelEn: x.labelEn ?? x.labelRu,
      aliases: x.aliases.join("\n"),
    })),
    { value: o.value, labelRu, labelUk: (o.labelUk || o.labelRu).trim(), labelEn: (o.labelEn || o.labelRu).trim(), aliases },
  ];
}
