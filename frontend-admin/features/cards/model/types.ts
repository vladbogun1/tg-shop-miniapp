/** «Карточки»: общие типы проверки ответа ИИ — замечания, уровни, значения характеристик и результат разбора по товарам. */
import type { CardItem } from "./item";
import type { CardAttribute } from "./schema";

export type Level = "ok" | "warn" | "error";

export interface CardIssue {
  level: "error" | "warn" | "info";
  text: string;
}

export type CardSpecValue = number | { min: number; max: number } | string | string[] | boolean;

export interface Proposal {
  key: string;
  value: string;
  why: string | null;
  /** The attribute it refers to (in the target category), if it exists. */
  attr: CardAttribute | null;
  /** Came from the validator (an option the AI put into specs anyway). */
  auto?: boolean;
}

export interface FieldReview {
  key: string;
  attr: CardAttribute | null;
  label: string;
  raw: unknown;
  /** Normalized value; undefined = dropped (error). */
  value?: CardSpecValue;
  before: unknown;
  changed: boolean;
  confidence: number | null;
  /** Source url of this value, when the AI named one ("field_sources"). */
  src: string | null;
  issues: CardIssue[];
  level: Level;
  /** Default of the field checkbox. */
  preselect: boolean;
}

export interface DescriptionReview {
  from: string;
  to: string;
  changed: boolean;
  issues: CardIssue[];
  level: Level;
}

export type TextField = "title" | "description" | "conditionNote";
export type TextLang = "ru" | "uk" | "en";
export const TEXT_FIELDS: TextField[] = ["title", "description", "conditionNote"];
export const TEXT_LABEL: Record<TextField, string> = {
  title: "Название",
  description: "Описание",
  conditionNote: "Причина уценки / состояние",
};

/**
 * One text of the card in three languages. Russian is the source: the import changes it (title,
 * description; the condition note only gets translations), uk/en are saved as translations of the
 * FINAL Russian text.
 */
export interface TextReview {
  field: TextField;
  /** Current Russian text in the database. */
  from: string;
  ru: string;
  uk: string;
  en: string;
  /** The Russian text the AI translated (its answer, before the admin's inline edits). */
  aiRu: string;
  /** Russian differs from the database (always false for the condition note). */
  changed: boolean;
  issues: Record<TextLang, CardIssue[]>;
  level: Level;
}

export interface ChangeReview {
  from: string | null;
  to: string;
  valid: boolean;
  issues: CardIssue[];
}

export interface ProductReview {
  /** Answer id ("p0a1b2c3d"). */
  id: string;
  item: CardItem;
  /** Product-level problems. */
  issues: CardIssue[];
  level: Level;
  category: ChangeReview | null;
  brand: ChangeReview | null;
  /** Category the fields were validated against. */
  targetCategory: string | null;
  fields: FieldReview[];
  /** Title / description / condition note in ru·uk·en (only what the answer touches). */
  texts: Partial<Record<TextField, TextReview>>;
  overall: number | null;
  sources: string[];
  notes: string | null;
  proposals: Proposal[];
  model: string | null;
}

export interface CardReview {
  products: ProductReview[];
  /** Answer ids that match no product. */
  unknown: string[];
  /** Entries that could not be used at all. */
  invalid: { id: string; problems: string[] }[];
}
