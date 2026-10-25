# tg-shop-v2 — правила для сессий

- Код сайта (`site/`), Mini App (`frontend/`) и `shared/` должен работать на **iOS Safari 15.4+ и Chrome 92+**.
  Перед тем как писать регулярки, новые API JS/CSS — смотри [docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md):
  там список запрещённого и фоллбеки. Lookbehind `(?<=`/`(?<!` во фронтах запрещён.
- После сборки: `node scripts/check-browser-compat.mjs site frontend` (то же делает CI).
- Не убирать `CHUNK_RECOVERY_SCRIPT` из `<head>` и `no-cache` для HTML в `infra/gateway*.conf` — это защита
  от рассинхрона версий после релизов.
- Репозиторий публичный: секреты, IP-логины, реквизиты не коммитить.
