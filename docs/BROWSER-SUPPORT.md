# Поддержка браузеров (сайт и Mini App)

**Минимум: iOS/iPadOS Safari 15.4 (и любые webview на нём — Telegram, Instagram), Chrome / Android WebView 92,
Samsung Internet 16, Firefox 90.** Админка (`frontend-admin`) — только свежие десктопные браузеры владельца.

Почему так: Next/SWC понижает *синтаксис* JS до целевых браузеров, но **не трогает регулярные выражения
и не добавляет новые API**, а чанк полифиллов Next грузится только в браузерах без ES-модулей — iOS 15/16
его не получает. Ошибка на верхнем уровне модуля убивает весь чанк: 25.10.2026 одна регулярка с lookbehind
в `packages/core/src/product-brand.ts` положила сайт и Mini App на всех iPhone с iOS < 16.4, а журнал ошибок
ничего не показал (обработчики вешаются в React-эффектах, до которых не дошло).

## Проверка

```bash
npm run build -w site && node scripts/check-browser-compat.mjs site
npm run build -w frontend && node scripts/check-browser-compat.mjs frontend
```
Скрипт смотрит **собранные** чанки (наш код + `@shop/shared` + зависимости) и **собранный CSS** и стоит в CI после сборки.
Находка рядом с проверкой `typeof …` / `"x" in …` считается защищённой.

## Нельзя без фоллбека → чем заменить

| Что | Safari с | Вместо |
|---|---|---|
| Lookbehind в регулярках `(?<=…)`, `(?<!…)` — и в литералах, и в `new RegExp("…")` | 16.4 | захватить предыдущий символ группой `(^\|[^…])` и сдвинуть индекс на её длину |
| Флаг `v` у RegExp | 17 | флаг `u` |
| `static { }` в классах | 16.4 | присвоение после объявления класса |
| `arr.toSorted/toReversed/toSpliced/with` | 16 | `[...arr].sort()` и т. п. |
| `Object.groupBy`, `Map.groupBy` | 17.4 | `reduce` |
| `Promise.withResolvers` | 17.4 | `new Promise((res, rej) => …)` |
| `Array.fromAsync` | 16.4 | `Promise.all` |
| `Set#union/intersection/…` | 17 | циклы |
| `structuredClone` | 15.4 ✓ | можно |
| `Array#at`, `Object.hasOwn`, `findLast` | 15.4 ✓ | можно |
| `requestIdleCallback` | нет вообще | `typeof window.requestIdleCallback === "function" ? … : setTimeout` |
| CSS `:has()`, `@container`, `text-wrap: balance` | 15.4–17.5 | только как улучшение, страница должна работать без них |
| `color-mix()` | 16.2 | в классах Tailwind — можно, запасную строку добавит PostCSS (ниже); в `style={{…}}` — `tint()` / `tintOver()` из `@shop/ui/tint`; в CSS-строках — своя запасная ветка (см. «color-mix») |
| `dvh/svh` | 15.4 ✓ | можно, но с `vh` до них в каскаде |

## color-mix() (iOS 15.4–16.1 без него)

Safari до 16.2 не знает `color-mix()` и выбрасывает **всю** строку с ним: фон статус-блока («Оплачен», «Ошибка»,
плашки, подсветка рамок) остаётся без цвета. Tailwind v4 к тому же кладёт перед миксом только непрозрачный
«двойник» (первый цвет без прозрачности: зелёная плашка с зелёным текстом) — этого мало.

Выбран один способ на весь проект — **заранее посчитанный цвет рядом с миксом, без `@supports`-дублей токенов**,
потому что цвета-токены статичные (одна тема), а смешиваются они всегда в sRGB с прозрачным или с `var(--surface)`:

1. **Классы Tailwind** (`bg-[color-mix(in_srgb,var(--ok)_16%,transparent)]`) — пиши как раньше. PostCSS-плагин
   `packages/ui/postcss/color-mix-fallback.cjs` (подключён в `site/` и `frontend/postcss.config.mjs`) при сборке
   берёт значения токенов из того же CSS и кладёт перед каждым миксом строку `rgba(…)` — на новых браузерах цвет
   тот же до пикселя (прозрачность считается как в спецификации, premultiplied). Цвет, который нельзя посчитать на
   сборке (`currentcolor`, переменная, заданная в рантайме), роняет сборку — тогда фоллбек пишется руками.
2. **Inline-стили** (`style={{ background: … }}` с цветом статуса из JS) — не `color-mix`, а `tint(color, pct)` и
   `tintOver(color, pct, base)` из `@shop/ui/tint`: дают `rgb(var(--ok-rgb) / .16)`. Для этого у токена должен быть
   двойник `--<имя>-rgb: r g b` в `globals.css` (сейчас: ok, warn, danger, faint, st-*). Меняешь цвет токена —
   меняй и двойник: скрипт проверки сверяет их и роняет CI при расхождении.
3. **CSS-строки в TS** (кейс подарков, `packages/ui/src/gift-case/case-styles.ts`): цвета приходят в рантайме
   (`--ga`, `--ga2`, `--rc` ставят `caseTierVars` / `rarityVars` вместе с `--*-rgb`), поэтому
   `case-styles-fallback.ts` строит из того же CSS блок `@supports not (color:color-mix(…))` с `rgb(var(--x-rgb) / a)`.
   Микс с белым/чёрным в нём упрощён до обычной подкраски — это декоративные свечения.

`scripts/check-browser-compat.mjs` после сборки ищет `color-mix(` в готовом CSS без запасной строки перед ним и в JS-чанках
(inline-стили, CSS-в-строках без блока `@supports not`) — любое нарушение роняет CI. Админка (`frontend-admin`) не проверяется.

Проверка без старого iPhone: в DevTools/Playwright отключить правило или подменить `CSS.supports` недостаточно, потому что
`color-mix` разбирается парсером; смотреть надо на сборку: `grep -c color-mix` по `.next/static/css` и стоящую перед
ним строку `rgba(…)`, плюс скриншоты с удалёнными строками `color-mix` (см. `_shots/fix-10`).

## Ещё правила

- **Ничего «умного» на верхнем уровне модулей** в общих файлах (`packages/`, layout, провайдеры): регулярки
  и тяжёлые вычисления — лениво, внутри функций. Тогда неподдержанная фича ломает одну функцию, а не весь бандл.
- Новое API без полной поддержки — только за проверкой: `if (typeof X?.y === "function")` + фоллбек.
- Поля событий не считать всегда заполненными: `KeyboardEvent.key` бывает `undefined` (автозаполнение
  на Android) — `e.key?.startsWith(…)`.
- После каждого релиза старый HTML может встретиться с новыми чанками. Защита: `CHUNK_RECOVERY_SCRIPT`
  (`packages/core/src/chunk-recovery.ts`, первым в `<head>` обоих приложений) и `Cache-Control: no-cache` на HTML
  в `infra/gateway*.conf`. Не убирать.
- Проверять глазами на WebKit (Playwright `webkit`, профиль iPhone) — скилл `shop-ui-qa`. Настоящий старый
  iPhone эмуляция не заменяет: её WebKit свежий, поэтому скрипт выше обязателен.
