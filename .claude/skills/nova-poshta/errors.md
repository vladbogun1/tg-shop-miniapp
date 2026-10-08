# Частые ошибки

## Новый REST

Формат: `{"errors":{"<поле>|errorMessage":"текст"}}`. Полный справочник по HTTP-кодам —
[reference/portal/methods__methods__api-errors.md](reference/portal/methods__methods__api-errors.md).

Встречены в песочнице 2026-10-08:

| HTTP | Тело | Причина / что делать |
|---|---|---|
| 401 | `Invalid token` | нет `Authorization` или мусор в нём |
| 401 | `Expired token` | JWT протух (TTL 3600 с) или подпись не та — перевыпустить JWT, повторить 1 раз |
| 422 | `{"apiKey":"The api key field is required."}` | `GET /clients/authorization` без ключа |
| 422 | `Vip not found in Ukraine` | неизвестный ключ **или** операция требует договорного UA-клиента (так отвечает `PUT /shipments/{id}` тест-ключу) |
| 422 | `{"limit":"The limit field must not be greater than 101."}` | `/divisions` с `limit>101` |
| 422 | `Contact Sender contains less than 2 words` | `/shipments/calculations` или `/shipments` без `sender.name` / с одним словом |
| 422 | `Max param value sizes is 60` | габарит места больше лимита поштомата (60×40×30 см) |
| 422 | `RecipientCityName not selected; RecipientCity is incorrect; Recipient counterparty person creation problem.` | UA-ТТН на адрес через `addressParts` — в песочнице не работает (внутри — валидация старого API) |
| 422 | `Server error` | `GET /shipments/print?type=marking` для UA-ТТН |
| 422 | `Print is not supported` | `GET /shipments/print?type=international` для UA-ТТН |
| 422 | `shipment_was_deleted` | повторный `DELETE /shipments/{id}` |
| 404 | `shipment_not_found` | `DELETE /shipments/<номер ТТН>` — нужен UUID `id` |
| 404 | `Shipments not found` / `not_found` | трекинг (Full/Basic) неизвестного или чужого номера |
| 422 | `{"secretToken":"The secret token field format is invalid."}` | в секрете вебхука не только `[A-Za-z0-9]` |
| 422 | `{"id":"The selected id is invalid."}` | `POST /tracking-push/subscribers/{id}/numbers` в песочнице; повторный `DELETE` подписки |
| 406 | `error send webhook` | `test-webhook`: наш URL не ответил 2xx |
| 502 | `timeout error` | разовый таймаут шлюза на `/shipments/calculations` — повторить с бэкоффом |

Общие из доки: 400 `Invalid JSON format`; 401 `Unauthenticated.` / `Cid profile not found`; 403 `Access denied to this registry`;
405 `Method Not Allowed`; 422 `Cid profile timeout`; 503 `Connection time-out`.

## Старый API 2.0

HTTP всегда **200**; смотреть `success`, `errors[]` (тексты), `errorCodes[]`, `warnings[]`, `warningCodes[]`.

| Текст / код | Причина |
|---|---|
| `Data is invalid` | битый JSON/кодировка тела (у нас так было при кириллице, переданной не в UTF-8 из shell) |
| `API key is invalid` / `API auth fail` (`20000200068`), `API key empty` (`20000200069`) | ключ неверный/просрочен/пустой |
| `To many requests` | лимит частоты — притормозить, повторить позже |
| `DocumentNumber is not specified`, `Documents is empty` | `getStatusDocuments` без номеров |
| `Afterpayment*` (`20000200031…20000200040`) | контроль оплати не подключён/запрещён для отделения/превышен лимит |
| `RecipientCityName not selected`, `RecipientCity is incorrect` | не указан/неверный `CityRecipient` |
| `Weight is invalid`, `OptionsSeat …` | вес/габариты (в т.ч. превышение лимитов поштомата) |
| `Document can't be deleted` | ТТН уже в обработке (отсканирована) |

Полный список кодов — `src/types/errors.ts` в `shopanaio/carrier-api` (там же human-readable имена) или метод
`CommonGeneral.getMessageCodeText`. Тексты ошибок старого API — по памяти и стороннему клиенту, точные формулировки уточнять по факту.

## Сетевые и прочее

- Старый API иногда отвечает медленно (до десятков секунд на большой `getWarehouses`) — таймаут 60 с, у нас так и стоит.
- Cloudflare на developers.novaposhta.ua отдаёт 403-челлендж автоматам — читать доку только из браузера.
- В песочнице нового API ТТН не двигается дальше статуса 1 (или 2 после удаления) — тестировать карту статусов на фикстурах.
