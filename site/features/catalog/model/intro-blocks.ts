/**
 * Splits the plain-text category SEO text (admin field `intro_text`) into blocks to render.
 *
 * The admin types plain text, no markup: blank lines split paragraphs, single line breaks stay. Two
 * shapes are recognised so the text does not read as one grey wall:
 * - a one-line paragraph, short and without a final period/colon («Як вибрати ігрову мишку», also a
 *   question like «Will these keycaps fit my keyboard?» — a FAQ question always has its answer under it) → heading;
 * - a paragraph whose first line ends with «?» and has more lines after it → question + answer (FAQ).
 * Everything else is a plain paragraph.
 */
export type IntroBlock =
  | { kind: "heading"; text: string }
  | { kind: "qa"; question: string; answer: string[] }
  | { kind: "paragraph"; lines: string[] };

const HEADING_MAX = 70;

export function introBlocks(text: string): IntroBlock[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p): IntroBlock => {
      const lines = p.split("\n").map((l) => l.trim());
      if (lines.length === 1 && p.length <= HEADING_MAX && !/[.!:;,…]$/.test(p)) {
        return { kind: "heading", text: p };
      }
      if (lines.length > 1 && lines[0].endsWith("?")) {
        return { kind: "qa", question: lines[0], answer: lines.slice(1) };
      }
      return { kind: "paragraph", lines };
    });
}
