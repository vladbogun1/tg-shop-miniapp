# reference/ — дополнения к официальному skill

Сам skill (SKILL.md, *.md, examples/) — без изменений из архива monobank
(https://monobank.ua/api-docs/acquiring/dev/ai-tools/docs--ai-skills, скачан 2026-10-05).

Здесь — то, чего в skill нет:

- `openapi-acquiring.json` — полная OpenAPI-спека эквайринга v2412 (вытащена из бандла сайта доков).
  В ней есть поля, которых нет в skill: `successUrl`/`failUrl` (включаются через поддержку),
  `displayType: "iframe"`, `withAppUrl` (→ `appUrl` monobank://pay/...), `paymentType: "verification"`, `metadata`.
- `acquiring-endpoints-flat.txt` — плоский список всех полей запросов/ответов.
- `dev_errors_payment.txt` — таблица `errCode` неуспешных оплат.

Как это используется в проекте — `docs/MONOBANK-ACQUIRING.md`.
