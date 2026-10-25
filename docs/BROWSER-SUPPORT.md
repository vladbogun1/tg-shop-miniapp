# Поддержка браузеров (сайт и Mini App)

**Минимум: iOS/iPadOS Safari 15.4 (и любые webview на нём — Telegram, Instagram), Chrome / Android WebView 92,
Samsung Internet 16, Firefox 90.** Админка (`frontend-admin`) — только свежие десктопные браузеры владельца.

Почему так: Next/SWC понижает *синтаксис* JS до целевых браузеров, но **не трогает регулярные выражения
и не добавляет новые API**, а чанк полифиллов Next грузится только в браузерах без ES-модулей — iOS 15/16
его не получает. Ошибка на верхнем уровне модуля убивает весь чанк: 25.10.2026 одна регулярка с lookbehind
в `shared/src/product-brand.ts` положила сайт и Mini App на всех iPhone с iOS < 16.4, а журнал ошибок
ничего не показал (обработчики вешаются в React-эффектах, до которых не дошло).

## Проверка

```bash
npm run build -w site && node scripts/check-browser-compat.mjs site
npm run build -w frontend && node scripts/check-browser-compat.mjs frontend
```
Скрипт смотрит **собранные** чанки (наш код + `@shop/shared` + зависимости) и стоит в CI после сборки.
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
| CSS `:has()`, `@container`, `text-wrap: balance`, `color-mix()` | 15.4–17.5 | только как улучшение, страница должна работать без них |
| `dvh/svh` | 15.4 ✓ | можно, но с `vh` до них в каскаде |

## Ещё правила

- **Ничего «умного» на верхнем уровне модулей** в общих файлах (`shared/`, layout, провайдеры): регулярки
  и тяжёлые вычисления — лениво, внутри функций. Тогда неподдержанная фича ломает одну функцию, а не весь бандл.
- Новое API без полной поддержки — только за проверкой: `if (typeof X?.y === "function")` + фоллбек.
- Поля событий не считать всегда заполненными: `KeyboardEvent.key` бывает `undefined` (автозаполнение
  на Android) — `e.key?.startsWith(…)`.
- После каждого релиза старый HTML может встретиться с новыми чанками. Защита: `CHUNK_RECOVERY_SCRIPT`
  (`shared/src/chunk-recovery.ts`, первым в `<head>` обоих приложений) и `Cache-Control: no-cache` на HTML
  в `infra/gateway*.conf`. Не убирать.
- Проверять глазами на WebKit (Playwright `webkit`, профиль iPhone) — скилл `shop-ui-qa`. Настоящий старый
  iPhone эмуляция не заменяет: её WebKit свежий, поэтому скрипт выше обязателен.
