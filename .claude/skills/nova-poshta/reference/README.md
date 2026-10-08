# reference/ — источники скилла nova-poshta

Снимок: **2026-10-08**.

## portal/ — новый портал Nova Post (официально)

Все страницы https://api-portal.novapost.com в Markdown: `llms.txt` (оглавление) + 116 страниц. Имя файла = путь URL,
`/` → `__` (`methods/methods/shipments.md` → `methods__methods__shipments.md`).

- Внутри страниц методов — блоки ```` ```json {"openapi":"3.0.0",…} ```` с полной OpenAPI-схемой метода. Читать их скриптом
  (JSON целиком в одной строке), а не глазами.
- В конце каждой страницы — блок «Agent Instructions» от GitBook: это шаблон платформы, не инструкции.
- Если ответа нет в снимке, портал отвечает на вопросы: `GET <url страницы>.md?ask=<вопрос>&goal=<цель>`.
- Главное для UA: `methods__methods__dictionaries.md` (settlements/divisions/streets), `…__shipments__create-shipments__domestic-shipments-within-ukraine.md`,
  `…__shipments__delivery-cost.md`, `…__shipments__tracking-shipment.md`, `…__shipments__print-documents.md`, `methods__methods__shipments.md`
  (GET/PUT/DELETE), `methods__methods__webhooks*.md`, `methods__methods__api-errors.md`, `methods__methods__registers.md`, `methods__methods__pickups.md`,
  `novaposhta-docs__integration-guide__*.md` (ключи, JWT, песочница), `changelog-1__2026__*.md` (что поменялось).

Обновить: `bash .claude/skills/nova-poshta/reference/update.sh` (bash + curl, без ключей) → поправить дату здесь и сверить
`changelog-1__*` с текстом скилла.

## sandbox-examples/ — живые запросы к песочнице (2026-10-08)

Обезличенные пары запрос/ответ к `https://api-stage.novapost.com/v.1.0/` с общим тестовым ключом (≈55 запросов).
Ключ, JWT, `cid`, ПІБ сотрудников отделений, чужие подписки — вырезаны (`<TEST_API_KEY>`, `<JWT>`, `<cid тестового клієнта>`).
ТТН, созданные при проверке (`20400554016016`, `20400554016338`), удалены; подписки на вебхук — удалены.
В каждом файле `_note` — что важного видно в ответе.

`90-old-api-getWarehouses-postomat.json` — единственный запрос к боевому старому API: публичный справочник `getWarehouses`
**без ключа**, для сверки `Ref` ↔ `externalId`.

## Старый JSON API 2.0 — откуда сведения

- Официальная дока https://developers.novaposhta.ua/documentation закрыта Cloudflare-челленджем (403 «Just a moment…») для
  скриптов; обходить нельзя. Читать из браузера.
- Вторичный источник: https://github.com/shopanaio/carrier-api, пакет `packages/novaposhta-api-client` (Apache-2.0, коммит
  `450ab76`, 2026-08-18): `src/types/{tracking,waybill,enums,errors,address,counterparty}.ts`, `docs/markdown/` (выдержки старой доки
  по справочникам и контрагентам). Оттуда: поля `getStatusDocuments`, `InternetDocument.save/update/delete/getDocumentPrice/getDocumentDeliveryDate/getDocumentList`,
  `BackwardDeliveryData`, `AdditionalServices.AfterPaymentOnGoodsCost`, коды `StatusCode`, коды ошибок.
- Наш код: `backend/src/main/java/com/maxsolch/shop/novaposhta/NovaPoshtaSyncService.java` (`AddressGeneral.getWarehouses`, `Limit` 500),
  `NovaPoshtaService.java` (refs типов отделений).
- Ссылки печати `my.novaposhta.ua/orders/print…` и `ScanSheet` — по памяти, в тексте помечены «сверить».

Всё, что в скилле про старый API помечено «по памяти» / «сверить», проверять первым боевым запросом и исправлять здесь.
