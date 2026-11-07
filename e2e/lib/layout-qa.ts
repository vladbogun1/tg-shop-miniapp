/**
 * Проверка вёрстки для спек-снимков (`99-fix*-shots`): ширины из `QA_WIDTHS` (через запятую, иначе — свои у спеки)
 * и поиск типовых косяков на каждом снимке — боковой скролл страницы, видимые элементы за правым/левым краем окна,
 * кнопки и плашки, у которых текст не помещается. Находки пишутся в `_shots/qa-layout.jsonl`, спеку не роняют:
 * это материал для глаз, а не проверка CI.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { REPO_ROOT } from "../env.js";

const REPORT = path.join(REPO_ROOT, "_shots", "qa-layout.jsonl");

/** Ширины снимков: `QA_WIDTHS=320,360,390,768,1024,1280,1440` или свои по умолчанию. */
export function shotWidths(defaults: readonly number[]): number[] {
  const env = process.env.QA_WIDTHS;
  if (!env) return [...defaults];
  return env.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
}

/** Высота окна для ширины: ПК — 900, планшет и телефон — 812. */
export const heightFor = (w: number) => (w >= 1024 ? 900 : 812);

export interface LayoutIssue {
  kind: "page-scroll" | "offscreen" | "clipped";
  what: string;
  px: number;
}

/** Ищет косяки на текущем экране; пишет найденное в отчёт с меткой снимка. */
export async function checkLayout(page: Page, label: string): Promise<LayoutIssue[]> {
  const issues = await page.evaluate(() => {
    const out: { kind: "page-scroll" | "offscreen" | "clipped"; what: string; px: number }[] = [];
    const vw = document.documentElement.clientWidth;
    const extra = document.documentElement.scrollWidth - vw;
    if (extra > 1) out.push({ kind: "page-scroll", what: "document", px: extra });
    const name = (el: Element) => {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
      const tid = el.getAttribute("data-testid");
      return `${el.tagName.toLowerCase()}${tid ? `[${tid}]` : ""} «${text}»`;
    };
    // Внутри горизонтально прокручиваемого или обрезающего контейнера выход за край — задумано (ленты, карусели).
    const insideScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
      }
      return false;
    };
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
    };
    for (const el of Array.from(document.querySelectorAll("button, a, input, select, textarea, [role=button], [role=tab], h1, h2, h3, label, p, span"))) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !insideScroller(el)) {
        out.push({ kind: "offscreen", what: name(el), px: Math.round(Math.max(r.right - vw, -r.left)) });
      }
    }
    for (const el of Array.from(document.querySelectorAll("button, [role=button], [role=tab], a"))) {
      if (!visible(el)) continue;
      const h = el as HTMLElement;
      const s = getComputedStyle(h);
      if (s.overflowX === "auto" || s.overflowX === "scroll") continue;
      if (h.scrollWidth > h.clientWidth + 1 && s.textOverflow !== "ellipsis") {
        out.push({ kind: "clipped", what: name(el), px: h.scrollWidth - h.clientWidth });
      }
    }
    return out;
  });
  if (issues.length) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.appendFileSync(REPORT, JSON.stringify({ shot: label, issues }) + "\n");
  }
  return issues;
}
