/** Scoped styling for HTML rendered inside the Telegram preview bubble. */
export const TG_PREVIEW_CSS = `
        .tg-preview a { color: #6ab3f3; text-decoration: none; }
        .tg-preview a:hover { text-decoration: underline; }
        .tg-preview code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: rgba(255,255,255,0.08);
          border-radius: 5px;
          padding: 1px 5px;
          font-size: 13px;
        }
        .tg-preview blockquote {
          border-left: 3px solid #6ab3f3;
          margin: 4px 0;
          padding: 2px 0 2px 10px;
          color: rgba(255,255,255,0.85);
        }
        .tg-preview b, .tg-preview strong { font-weight: 700; }
        .tg-preview i, .tg-preview em { font-style: italic; }
      `;
