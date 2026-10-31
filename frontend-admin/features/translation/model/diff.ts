/** Пословный diff (для предложенной правки оригинала) и сходство текстов. Чистые функции. */

export function countMap(list: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

export interface DiffPart {
  type: "same" | "del" | "add";
  text: string;
}

function tokens(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

const MAX_DIFF_TOKENS = 2000;

function lcsTable(a: string[], b: string[]): Uint16Array[] {
  const t: Uint16Array[] = [];
  for (let i = 0; i <= a.length; i++) t.push(new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  return t;
}

/** Word-level diff; null when the texts are too long to diff in the browser. */
export function wordDiff(from: string, to: string): DiffPart[] | null {
  const a = tokens(from);
  const b = tokens(to);
  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) return null;
  const t = lcsTable(a, b);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) {
      push("del", a[i++]);
    } else {
      push("add", b[j++]);
    }
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return out;
}

export function wordSimilarity(a: string, b: string): number {
  const wa = a.split(/\s+/).filter(Boolean);
  const wb = b.split(/\s+/).filter(Boolean);
  if (!wa.length && !wb.length) return 1;
  if (wa.length > MAX_DIFF_TOKENS || wb.length > MAX_DIFF_TOKENS) {
    // Too long for LCS: compare multisets of words.
    const ca = countMap(wa);
    let common = 0;
    for (const w of wb) {
      const n = ca.get(w) ?? 0;
      if (n > 0) {
        common++;
        ca.set(w, n - 1);
      }
    }
    return (2 * common) / (wa.length + wb.length);
  }
  const t = lcsTable(wa, wb);
  return (2 * t[0][0]) / (wa.length + wb.length);
}

