/** Строки выпадающего выбора категории: корни и подкатегории с поиском. */
import { normText } from "./search";
import { buildTree, pathLabel } from "./tree";
import type { AdminCategory } from "./types";

export interface TreeSelectRow {
  id: string;
  label: string;
  depth: 0 | 1;
  selectable: boolean;
  count?: number;
  hidden?: boolean;
  sub?: string;
}

export interface TreeSelectExtra {
  value: string;
  label: string;
}

/**
 * mode "leaf": корень с детьми — несекционируемый заголовок над своими подкатегориями;
 * mode "any": выбирается любая категория. Дополнительные строки (`extra`) — сверху, пока нет запроса.
 */
export function treeSelectRows(
  categories: AdminCategory[],
  query: string,
  extra: TreeSelectExtra[],
  mode: "leaf" | "any"
): TreeSelectRow[] {
  const nq = normText(query);
  const hit = (c: AdminCategory) => !nq || normText(c.name).includes(nq) || c.slug.includes(nq);
  const out: TreeSelectRow[] = [];
  if (!nq) for (const e of extra) out.push({ id: e.value, label: e.label, depth: 0, selectable: true });
  for (const { cat, children } of buildTree(categories)) {
    const kids = children.filter((k) => hit(k) || hit(cat));
    if (!hit(cat) && kids.length === 0) continue;
    const hasKids = children.length > 0;
    out.push({
      id: cat.id,
      label: cat.name,
      depth: 0,
      selectable: mode === "any" || !hasKids,
      count: cat.productCount,
      hidden: !cat.showInMenu,
      sub: hasKids && mode === "leaf" ? `${children.length} подкат.` : undefined,
    });
    for (const k of kids) {
      out.push({ id: k.id, label: k.name, depth: 1, selectable: true, count: k.productCount, hidden: !k.showInMenu });
    }
  }
  return out;
}

/** Стрелки/Home/End в списке: новая позиция курсора и нужно ли гасить прокрутку страницы; null — не наша клавиша. */
export function moveCursor(key: string, active: number, count: number): { index: number; prevent: boolean } | null {
  switch (key) {
    case "ArrowDown":
      return { index: Math.min(count - 1, active + 1), prevent: true };
    case "ArrowUp":
      return { index: Math.max(0, active - 1), prevent: true };
    case "Home":
      return { index: 0, prevent: false };
    case "End":
      return { index: count - 1, prevent: false };
    default:
      return null;
  }
}

/** Подпись выбранного значения: строка `extra` или путь категории; null — ничего не выбрано. */
export function selectedLabel(categories: AdminCategory[], extra: TreeSelectExtra[], value: string): string | null {
  const fromExtra = extra.find((e) => e.value === value)?.label;
  if (fromExtra !== undefined) return fromExtra;
  return value ? pathLabel(categories, value) || null : null;
}
