---
name: nova-poshta
description: Справочник по API «Нової пошти» для магазина — отделения/поштоматы/города (синхронизация справочника, связь Ref↔externalId), создание/правка/удаление ТТН, стоимость и срок доставки, отслеживание и коды статусов, наложенный платёж и «Контроль оплати», печать маркировок, реестры, курьер, вебхуки, песочница api-stage. Использовать при любой работе с Новой почтой в backend/site/frontend/frontend-admin.
---

# Нова пошта — API для магазина

Снимок документации и проверок песочницы: **2026-10-08**. Всё, что помечено «песочница», проверено живыми запросами
(обезличенные примеры — [reference/sandbox-examples/](reference/sandbox-examples/)).

## Два API

| | **Старый JSON API 2.0** | **Новый REST (Nova Post)** |
|---|---|---|
| URL | `POST https://api.novaposhta.ua/v2.0/json/` | `https://api.novapost.com/v.1.0/` (prod), `https://api-stage.novapost.com/v.1.0/` (sandbox) |
| Формат | `{apiKey, modelName, calledMethod, methodProperties}`; HTTP всегда 200, ошибки в `success/errors[]` | REST, JSON, нормальные HTTP-коды, `{"errors":{…}}` |
| Авторизация | `apiKey` в теле (ключ из бизнес-кабинета new.novaposhta.ua → Налаштування → Безпека) | ключ → `GET /clients/authorization?apiKey=` → JWT на 1 час, заголовок `Authorization: <jwt>` (без Bearer) |
| Песочница | **нет** (всё боевое) | **есть**, тестовый ключ через `POST /test-api-keys` |
| Документация | developers.novaposhta.ua (за Cloudflare-челленджем, автоматом не читается) | api-portal.novapost.com, снимок в [reference/portal/](reference/portal/) |
| Покрытие UA | полное: всё, что умеет бизнес-кабинет | расширяется; для UA часть функций не работает (см. ниже) |
| Мы используем | да — `NovaPoshtaSyncService` (`AddressGeneral.getWarehouses`, ночной синк в `nova_poshta_warehouses`) | пока нет |

Есть ещё `https://api.novaposhta.ua/v.1.0/` — тот же REST (JWT), но «только UA и UA→мир» (см. `novaposhta-docs__integration-guide__how-to-choose-the-appropriate-endpoint.md`). Ключ UA бизнес-кабинета предназначен для него; на песочнице `api-stage` UA-ключи не выпускаются.

## Что брать (наша рекомендация)

- **Справочник отделений** — оставить старый `getWarehouses` (работает **без ключа**, 1 запрос = до 500 отделений, наши `ref` = его `Ref`). Новый `/divisions` полезен как источник лимитов габаритов/веса и графика — его `externalId` = тот же `Ref`, так что данные можно сливать без маппинга. Детали — [directory.md](directory.md).
- **Трекинг заказов (этап 1)** — старый `TrackingDocument.getStatusDocuments` (до 100 ТТН за запрос, с телефоном получателя — полные данные). Это то, что гарантированно видит ТТН, созданные вручную в кабинете/приложении. Вебхуки нового API для UA-ТТН из кабинета реально проверить в песочнице нельзя (там их не шлют), поэтому вебхуки — только как ускоритель поверх периодического опроса. Детали и карта статусов — [tracking.md](tracking.md), [webhooks.md](webhooks.md).
- **Создание ТТН из админки (этап 3)** — старый `InternetDocument.save` от имени контрагента-ФОП (бизнес-ключ): там работают наложка (`BackwardDeliveryData`), «Контроль оплати» (`AfterpaymentOnGoodsCost`), правка, печать, реестры. Новый `POST /shipments` в песочнице создаёт UA-ТТН, но для нашего сценария неполон: COD для UA молча игнорируется, `PUT` недоступен физлицу, печать UA не работает, адресная доставка не создалась. Детали — [shipments.md](shipments.md).

## Минимальные флоу

**Трекинг (старый API):**
1. Раз в N минут выбрать заказы `SHIPPED` с `tracking_number`.
2. Пачками по ≤100: `TrackingDocument.getStatusDocuments` с `Documents:[{DocumentNumber, Phone}]` (телефон получателя из заказа).
3. По `StatusCode` обновить статус/уведомить (карта в [tracking.md](tracking.md)); финальные (9/10/11, 2, 102/103/105/106) больше не опрашивать.

**Создание ТТН (старый API, бизнес-ключ ФОП):**
1. Один раз: `Counterparty.getCounterparties {CounterpartyProperty:"Sender"}` → `Sender`; `getCounterpartyContactPersons` → `ContactSender` + телефон; отделение отправки → `SenderAddress` (=`Ref` отделения).
2. На заказ: `getDocumentPrice`/`getDocumentDeliveryDate` (по желанию) → `InternetDocument.save` → сохранить `Ref` и `IntDocNumber` → печать маркировки по ссылке.
3. Ошибка/отмена до отправки: `InternetDocument.delete {DocumentRefs:[Ref]}`.

**Песочница нового API** — [auth-and-sandbox.md](auth-and-sandbox.md): `POST /test-api-keys` → JWT → `/divisions`, `/settlements`, `/shipments/calculations`, `POST/DELETE /shipments`, `/shipments/tracking*`, `/tracking-push/subscribers` (+ test-webhook).

## Файлы

- [auth-and-sandbox.md](auth-and-sandbox.md) — ключи (UA кабинет / my.novapost.com / тестовый), JWT, песочница и что в ней не работает.
- [directory.md](directory.md) — города, отделения, поштоматы, улицы; `externalId`↔`Ref`; типы отделений; лимиты веса/габаритов.
- [shipments.md](shipments.md) — ТТН в обоих API: обязательные поля, отправитель-ФОП, получатель, оплата, наложка vs контроль оплати, печать, реестр, курьер.
- [cost-and-dates.md](cost-and-dates.md) — расчёт цены и даты.
- [tracking.md](tracking.md) — трекинг в обоих API, все коды статусов, карта → статусы заказа.
- [webhooks.md](webhooks.md) — подписки, payload, события, повторы, тест.
- [errors.md](errors.md) — частые ошибки (с текстами из песочницы).
- [reference/README.md](reference/README.md) — источники, дата снимка, `reference/update.sh`.

## Грабли (коротко)

1. **Ключ и JWT — разные вещи.** JWT живёт ровно 3600 с; кэшировать и обновлять заранее. `Authorization: <jwt>` без `Bearer`.
2. **Тестовый ключ песочницы общий** (физлицо, без организации): там видны чужие подписки на вебхуки и чужие ТТН. Ничего чужого не удалять, в git ключ не писать.
3. **`externalId` у `/divisions` = `Ref` старого API**, но в доке помечен «internal, may change» — храните оба, ключом оставьте `Ref`. `settlement.externalId` = `SettlementRef`, **не** `CityRef`.
4. **`number` в новом API = `WarehouseIndex` старого** (`"38/1"`), а не номер отделения (`"1"`).
5. **Единицы**: новый API при создании — мм и граммы, в ответах трекинга — см и кг; старый — см и кг везде.
6. **Расчёт стоимости в новом API требует `sender.name` из 2+ слов**, хотя в схеме поля нет; дату доставки для UA не возвращает (`scheduledDeliveryDate: null`).
7. **COD нового API для UA игнорируется молча** (201 Created без услуги). Наложка для UA — только старый API.
8. **Номер ТТН UA — 14 цифр** (`204005540160xx`), доки нового API пишут `SHPL0000000001` — не валидировать по их regex.
9. **Удаление в новом API — только по `id` (UUID)**, по номеру → 404 `shipment_not_found`. Повторное удаление → 422 `shipment_was_deleted`.
10. **Вебхуки в песочнице не шлются на реальные смены статуса** — только `test-webhook`. Добавление номеров в подписку в песочнице падает (`The selected id is invalid.`).
11. **Наш код**: `NovaPoshtaService.TYPE_POINT = 9a68df70…` — это на самом деле «Вантажне відділення» (CargoBranch, например Харків №1), а не пункт выдачи. См. [directory.md](directory.md#типы-отделений).
12. Чтение developers.novaposhta.ua скриптом блокирует Cloudflare — обходить нельзя; старое API описано по вторичным источникам (помечено в тексте).
