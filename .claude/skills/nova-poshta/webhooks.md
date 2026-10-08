# Вебхуки (только новый REST)

У старого API 2.0 вебхуков нет — только опрос `getStatusDocuments`.

Доки: [reference/portal/methods__methods__webhooks.md](reference/portal/methods__methods__webhooks.md) (+ `…__new-subscription`, `…__subscription-types`,
`…__event-types-and-tracking-status-codes`, `…__test-webhook`, `…__subscription-update`, `…__adding-numbers…`, `…__deleting-numbers…`).

## Подписки

| Метод | Путь |
|---|---|
| список | `GET /tracking-push/subscribers` |
| создать | `POST /tracking-push/subscribers` |
| изменить (полная замена!) | `PUT /tracking-push/subscribers/{id}` |
| удалить | `DELETE /tracking-push/subscribers/{id}` |
| добавить/убрать номера (тип `numbers`) | `POST` / `DELETE /tracking-push/subscribers/{id}/numbers` `{"numbers":[…]}` |
| тест | `POST /tracking-push/subscribers/test-webhook` `{"numbers":["SHPL0000000001"],"id":"<subId>","cid":"<cid из JWT>"}` |

Тело создания:

```json
{
  "type": "numbers",
  "url": "https://demo.chisetup.com.ua/api/np/webhook",
  "isActive": true,
  "contentType": "application/json",
  "eventTypes": [],
  "secretToken": "<латиница+цифры, ≤600>",
  "secretTokenHeaderName": "X-NP-Key",
  "sendWarnings": false
}
```

→ песочница: **200** (в доке 201), объект подписки с полями и в camelCase, и в snake_case
([51-webhook-create.json](reference/sandbox-examples/51-webhook-create.json)). `secretToken` с пробелом/`!` → 422
`The secret token field format is invalid.`

Типы (`type` после создания не меняется):

| type | Какие ТТН | Нам |
|---|---|---|
| `creator` | все ТТН, созданные этим API-клиентом, автоматически | если ТТН будем создавать через новый API |
| `numbers` | только добавленные вручную номера | для ТТН, введённых админом вручную |
| `individual` | отправитель с телефоном `phone` | ФОП-физлицо |
| `legal` | отправитель с `companyTins` | ФОП/юрлицо — ловит и ТТН из кабинета |
| `recipientLegal` | получатель с `companyTins` | — |

Прочее: подписок можно сколько угодно, не истекают; одна ТТН в нескольких подписках — одно уведомление;
`PUT` сбрасывает всё, что не передано (сначала `GET`, потом полный `PUT`); пока `isActive:false` события теряются.

## Запрос к нам

```
POST <url>
Content-Type: application/json            (по умолчанию text/plain — устаревает, ставить application/json)
X-NP-Key: <secretToken>                   (или имя из secretTokenHeaderName)
x-np-attempt: 8f14e45f-ceea-467e-9a3a-0e1a1b1e2b1c.2   ({UUID сообщения}.{номер попытки})
```

```json
{
  "number": "20450000000000",
  "scheduled_delivery_date": "2026-10-10T00:00:00.000000Z",
  "history_tracking": [
    {"code": "4", "code_name": "…", "country_code": "UA", "settlement": "Харків", "date": "2026-10-08T09:32:05.000000Z"},
    {"code": "7", "code_name": "…", "country_code": "UA", "settlement": "Київ",   "date": "2026-10-09T08:10:00.000000Z"}
  ]
}
```

- **Подписи нет** — только сравнение секрета в заголовке (constant-time). Других механизмов (HMAC, IP-список) в доке нет.
- Каждое уведомление несёт **всю историю**; текущий статус — запись с максимальной `date`. `code` — строка, коды как в
  [tracking.md](tracking.md#коды-statuscode-нового-api-ua-значимые-выделены).
- Шлётся при смене статуса на отличный от **предыдущего** (4→4→5 = 2 уведомления; 4→5→4 = 3).
- Не шлётся для событий до создания подписки.

### Ответ и повторы

- Ответить **2xx быстро**, обработку — в очередь. Иначе до **6 повторов**: 5, 10, 20, 40, 80, 160 с. После 3-й неудачи — письмо на
  `warningEmail` (если `sendWarnings`). После 6-й — сообщение теряется, подписка остаётся активной.
- Идемпотентность: UUID из `x-np-attempt` (часть до точки) хранить в БД в той же транзакции, что и данные; повтор → сразу 2xx.
- URL — публичный HTTPS без редиректов.

## `eventTypes` (фильтр в подписке, регистрозависимо, опечатка молча = нет фильтра)

`ReadyToShip`, `Deleted`, `ParcelPlaceRemoved`, `Received`, `MoneyTransfer`, `MoneyTransferReceived`, `Returned`, `Refused`,
`Redirecting`, `Utilization`, `Redelivery`, `UndeliveryReason`, `ChangeTime`, `ArrivalSC`, `TransferToPartner`, `LoadingCourier`,
`ArrivalSenderWarehouse`, `DepartureSenderWarehouse`, `InCityRecipient`, `AwaitingOnDivision`.

Для этапа 1 достаточно: `DepartureSenderWarehouse`, `AwaitingOnDivision`, `Received`, `MoneyTransfer`, `MoneyTransferReceived`,
`Refused`, `Returned`, `Redirecting`, `Utilization`, `Deleted` (или пусто = все).

## Песочница (2026-10-08)

- Реальные смены статуса **не шлются** (так и в доке) — проверять только `test-webhook`.
- `test-webhook` на наш `https://demo.chisetup.com.ua/api/np/webhook` (эндпоинта пока нет → 404) → **406**
  `{"errors":{"errorMessage":"error send webhook"}}`, т.е. NP реально стучится и проверяет 2xx. Тестовое тело — синтетическое
  (`SHPL0000000001`, коды 4 и 112), `eventTypes` не учитывает.
- `POST /{id}/numbers` → 422 `{"errors":{"id":"The selected id is invalid."}}` (на двух свежих подписках), `DELETE /{id}/numbers` с тем же
  id → 200 `{"status":"error","errors":{"message":"Some numbers were not found",…}}` — у `DELETE /numbers` результат смотреть в теле, не в коде.
- Тестовый клиент общий — в списке видна чужая подписка `creator`. После тестов удалять только свои (по `id`).

## Рекомендация

Вебхук — ускоритель, а не источник истины: для UA-ТТН, созданных вручную в кабинете, нужен тип `legal` по ЕДРПОУ/ИНН ФОП или `numbers`
(который в песочнице не проверить). Основной механизм этапа 1 — опрос старого `getStatusDocuments`; вебхук-эндпоинт сделать
идемпотентным, чтобы включить его позже без переделок.
