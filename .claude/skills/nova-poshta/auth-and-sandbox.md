# Ключи, JWT, песочница

## Какие бывают ключи

| Ключ | Где взять | Для чего | Песочница |
|---|---|---|---|
| **UA бизнес-ключ** | new.novaposhta.ua → Налаштування → Безпека → «Створити ключ» (прямая ссылка `https://new.novaposhta.ua/dashboard/settings/developers`), под логином ФОП/юрлица | старый JSON API 2.0 (`apiKey` в теле) и UA-REST `https://api.novaposhta.ua/v.1.0/` (через JWT) | нет |
| **my.novapost.com ключ** | my.novapost.com → Integrations → API Keys; физлицо, привязанное к организации через менеджера NP | новый REST `api.novapost.com` (Европа, международка, постепенно UA) | нет (prod) |
| **Тестовый ключ** | `POST https://api-stage.novapost.com/v.1.0/test-api-keys` `{"phone":"380…"}` (телефон должен быть зарегистрирован в my.novapost.com) | только `api-stage.*` | да |

Ключи выдаются **физлицам**; для бизнеса — уполномоченному представителю из договора
(`novaposhta-docs__integration-guide__api-key-generation.md`).

Наш прод-ключ (старый API) — переменная `NOVAPOSHTA_API_KEY` → `app.novaposhta.api-key`. Сейчас для синка справочника он
не обязателен: `getWarehouses` отвечает и без ключа (проверено 2026-10-08).

## Тестовый ключ (песочница)

```http
POST https://api-stage.novapost.com/v.1.0/test-api-keys
Content-Type: application/json

{"phone":"380000000000"}
```

- Без JWT. Только в не-prod.
- Один активный ключ на телефон, «не чаще раза в сутки»; повторный вызов в тот же день возвращает тот же ключ, протухший — реактивирует с новой датой.
- «UA key generation is currently not supported» — ключ создаётся не для UA-организации, а для физлица.
- На 2026-10-08 существующий общий тестовый клиент (телефон `380000000000`) уже имеет ключ, действующий до 2027-10-08.
  **Сам ключ в репозиторий не пишем** (репо публичное) — получать вызовом выше, хранить в env/секретах
  (`<TEST_API_KEY>` в примерах).
- Клиент **общий**: другие интеграторы с этим же ключом видны в `GET /tracking-push/subscribers`
  (чужая подписка `creator` на `https://localhost:…`). Чужое не трогать.

## JWT

```http
GET https://api-stage.novapost.com/v.1.0/clients/authorization?apiKey=<TEST_API_KEY>
→ 200 {"jwt":"eyJ…"}
```

Payload (проверено): `{"iss":"np","iat":…,"exp":iat+3600,"cid":"<uuid клиента>","ref":"…","src":"local","sub":"…"}`.

- TTL **ровно 3600 с**. Кэшировать на ~55 мин, при 401 `Expired token` — перевыпустить и повторить запрос один раз.
- Заголовок: `Authorization: <jwt>` (без `Bearer`; в доках так, в песочнице работает).
- `cid` из JWT нужен в `POST /tracking-push/subscribers/test-webhook`.
- Количество одновременных сессий на аккаунт «может быть ограничено» — не выпускать JWT на каждый запрос.

Ошибки (песочница, [02-auth-errors.json](reference/sandbox-examples/02-auth-errors.json)):

| Ситуация | HTTP | Тело |
|---|---|---|
| нет `apiKey` | 422 | `{"errors":{"apiKey":"The api key field is required."}}` |
| неизвестный ключ | 422 | `{"errors":{"errorMessage":"Vip not found in Ukraine"}}` |
| нет `Authorization` | 401 | `{"errors":{"errorMessage":"Invalid token"}}` |
| мусорный/чужой JWT | 401 | `Invalid token` или `Expired token` |

## Что в песочнице работает / нет (2026-10-08, общий тестовый ключ)

| Метод | Результат |
|---|---|
| `GET /clients/authorization` | ✅ |
| `GET /settlements`, `/divisions` (UA, реальные данные) | ✅ (`limit` ≤ 101) |
| `POST /shipments/calculations` UA→UA | ✅ цена есть, даты нет (`scheduledDeliveryDate: null`); нужен `sender.name` |
| `POST /shipments` UA отделение→отделение / →поштомат | ✅ 201, номер ТТН 14 цифр |
| `POST /shipments` UA на адрес (`addressParts`) | ❌ 422 `RecipientCityName not selected; RecipientCity is incorrect; Recipient counterparty person creation problem.` |
| `services[COD]` для UA | ⚠️ 201, но услуга COD молча отброшена |
| `GET /shipments?numbers[]=` | ✅ |
| `PUT /shipments/{id}` | ❌ 422 `Vip not found in Ukraine` (нужен договорной клиент) |
| `DELETE /shipments/{id}` | ✅ `{"success":true}` |
| `GET /shipments/print` UA | ❌ `type=marking` → 422 `Server error`; `type=international` → 422 `Print is not supported` |
| `GET /shipments/tracking`, `/tracking/history` | ✅ по своим ТТН (статусы 1 и 2 — дальше в песочнице ТТН не движется) |
| `GET/POST/DELETE /tracking-push/subscribers` | ✅ |
| `POST /tracking-push/subscribers/{id}/numbers` | ❌ 422 `{"errors":{"id":"The selected id is invalid."}}` |
| `POST …/test-webhook` | ✅ шлёт POST на ваш URL; если URL не ответил 2xx → 406 `error send webhook` |
| вебхуки на реальные смены статуса | ❌ в песочнице не шлются (так и в доке) |

Не проверяли (не нужно для этапов 1/3 или требует организацию): `/registry`, `/pickups`, `/shipments/modification/*`, COD для EU.

## Демо-стенд

На demo.chisetup.com.ua с тестовым ключом реально гонять: поиск городов/отделений нового API, расчёт цены, создание/удаление
ТТН, трекинг созданной ТТН (только статусы «створено»/«скасовано»), создание подписки + `test-webhook` на наш эндпоинт
(проверка подписи `X-NP-Key` и идемпотентности по `x-np-attempt`). Не получится: движение ТТН по статусам, печать, наложка,
правка ТТН. Для полного цикла трекинга старого API песочницы нет — только боевые ТТН и боевой ключ.
