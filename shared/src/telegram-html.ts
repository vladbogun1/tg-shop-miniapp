/**
 * Telegram's HTML subset: validation for what we are about to send, and sanitising for the
 * preview that shows it.
 *
 * <p>The broadcast composer rendered the admin's raw input with `dangerouslySetInnerHTML` and sent
 * it to Telegram unchecked. Two consequences: the preview could execute whatever was pasted into
 * it, and a single unclosed tag made the API reject the message — for every recipient, silently,
 * because each failure was just counted as "failed".
 *
 * <p>Tag list per Telegram's "HTML style" documentation.
 */

const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ins",
  "s",
  "strike",
  "del",
  "a",
  "code",
  "pre",
  "blockquote",
  "span",
  "tg-spoiler",
  "br",
]);

/** Telegram rejects anything longer than this. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

export interface HtmlProblem {
  message: string;
}

/**
 * Checks the message against what Telegram will accept: length, known tags, and balance.
 * Returns an empty array when the message is fine.
 */
export function validateTelegramHtml(html: string): HtmlProblem[] {
  const problems: HtmlProblem[] = [];
  const text = html ?? "";

  if (!text.trim()) {
    problems.push({ message: "Сообщение пустое" });
    return problems;
  }
  if (text.length > TELEGRAM_MESSAGE_LIMIT) {
    problems.push({
      message: `Слишком длинно: ${text.length} из ${TELEGRAM_MESSAGE_LIMIT} символов`,
    });
  }

  const stack: string[] = [];
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(text)) !== null) {
    const raw = match[0];
    const name = match[1].toLowerCase();
    const selfClosing = match[2] === "/" || name === "br";

    if (!ALLOWED_TAGS.has(name)) {
      problems.push({ message: `Тег <${name}> Telegram не поддерживает` });
      continue;
    }
    if (selfClosing) continue;

    if (raw.startsWith("</")) {
      const open = stack.pop();
      if (open !== name) {
        problems.push({
          message: open
            ? `Тег <${open}> закрыт как </${name}>`
            : `Закрывающий </${name}> без открывающего`,
        });
      }
    } else {
      stack.push(name);
    }
  }
  if (stack.length > 0) {
    problems.push({ message: `Не закрыт тег <${stack[stack.length - 1]}>` });
  }

  // Deduplicate: one message per distinct problem is enough for the composer.
  const seen = new Set<string>();
  return problems.filter((p) => (seen.has(p.message) ? false : seen.add(p.message)));
}

/**
 * Strips everything Telegram would not render, for the preview pane.
 *
 * <p>Attributes are dropped except `href` on links (and only http/https/tg targets), which is what
 * makes rendering the result safe: no event handlers, no `javascript:` urls, no `<script>`,
 * no `<style>`, no `<img onerror=...>`.
 */
export function sanitizeTelegramHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (full, rawName: string, rawAttrs: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return "";
      if (full.startsWith("</")) return `</${name}>`;
      if (name === "br") return "<br>";
      if (name === "a") {
        const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(rawAttrs);
        const url = (href?.[2] ?? href?.[3] ?? "").trim();
        return /^(https?:\/\/|tg:\/\/)/i.test(url)
          ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">`
          : "<a>";
      }
      return `<${name}>`;
    });
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
