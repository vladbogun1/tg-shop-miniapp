# Справочник: города, отделения, поштоматы, улицы

## Связь двух API (проверено 2026-10-08)

| Старый API (`AddressGeneral.getWarehouses`) | Новый API (`GET /divisions`) | Пример (Харків, відділення №1) |
|---|---|---|
| `Ref` | `externalId` (и `additionalIds[type=InternetAddress].value`) | `169227f4-e1c2-11e3-8c4a-0050568002cf` |
| `WarehouseIndex` | `number` | `38/1` |
| `Number` | — (только в `name`) | `1` |
| `SettlementRef` | `settlement.externalId` в `/settlements` | `e71f8842-4b33-11e4-ab6d-005056801329` |
| `CityRef` | **нет** | `db5c88e0-391c-11dd-90d9-001a92567626` |
| `TypeOfWarehouse` (ref) / `CategoryOfWarehouse` | `divisionCategory` | `9a68df70…` / `Branch` ↔ `CargoBranch` |
| `PlaceMaxWeightAllowed` (кг), `ReceivingLimitationsOnDimensions` (см) | `maxWeightPlaceRecipient` (г), `max*PlaceRecipient` (мм) | 1100 кг / 600×170×220 см |
| — | `id` (int, нужен в `/shipments*` как `divisionId`) | `7386` |

Поштомат №3158 Харків: `Ref` = `externalId` = `40abfb08-ee36-11e8-ad0d-005056b24375`, `WarehouseIndex` = `number` = `38/3158`
(пример — [90-old-api-getWarehouses-postomat.json](reference/sandbox-examples/90-old-api-getWarehouses-postomat.json),
[12-divisions-kharkiv-postomat.json](reference/sandbox-examples/12-divisions-kharkiv-postomat.json)).

Как связать с нашей таблицей `nova_poshta_warehouses` (`NovaPoshtaWarehouse`, PK `ref` = `Ref` старого API):
- `nova_poshta_warehouses.ref` = `division.externalId`. Для перехода к новому API нужна колонка `np_division_id` (int) —
  заполнять из `/divisions` по `externalId`, т.к. `POST /shipments` и `/calculations` принимают `divisionId`/`divisionNumber`, а не `Ref`.
  Вместо `divisionId` можно слать `divisionNumber` = наш `WarehouseIndex` (`"38/1"`) — его надо начать синкать (`WarehouseIndex` в `getWarehouses` уже есть).
- `orders.np_warehouse_ref` = тот же `Ref` — для старого `InternetDocument.save` (`RecipientAddress`) годится напрямую.
- `orders.np_city_ref` = `CityRef` (старый) — в новом API аналога нет; город в новом API = `settlementId` (int) / `SettlementRef`.
- Оговорка: в OpenAPI `externalId` описан как «Internal identifier. Not intended for use in integrations… may be changed». Сейчас совпадает; храните `Ref` как ключ.

## Старый API (вторичный источник: наш код + `shopanaio/carrier-api`, официальные доки за Cloudflare)

Все методы: `POST https://api.novaposhta.ua/v2.0/json/`, тело `{"apiKey":"…","modelName":"AddressGeneral"|"Address","calledMethod":"…","methodProperties":{…}}`.
Ответ: `{"success":true,"data":[…],"errors":[],"warnings":[],"info":{"totalCount":N},"errorCodes":[],…}`.

| Метод | Параметры | Зачем |
|---|---|---|
| `getWarehouses` | `CityRef`/`CityName`/`SettlementRef`, `WarehouseId` (номер), `TypeOfWarehouseRef`, `FindByString`, `Page`, `Limit` (≤500) | справочник отделений (наш синк; работает без ключа) |
| `getWarehouseTypes` | — | справочник типов (`Ref`, `Description`) |
| `getCities` | `FindByString`, `Ref`, `Page`, `Limit` | города по `CityRef` |
| `searchSettlements` | `CityName`, `Limit`, `Page` | автокомплит населённых пунктов; `data[0].Addresses[]` с `Present`, `Ref` (=SettlementRef), `DeliveryCity` (=CityRef), `Warehouses` |
| `getSettlements` | `AreaRef`, `Ref`, `FindByString`, `Warehouse:"1"`, `Page` | полный справочник н.п. |
| `searchSettlementStreets` | `StreetName`, `SettlementRef`, `Limit` | улицы для курьерской доставки; `data[0].Addresses[]` с `SettlementStreetRef`, `Present`, `StreetsType` |
| `getStreet` | `CityRef`, `FindByString`, `Page` | улицы по `CityRef` (старый вариант) |

Поля `getWarehouses`, важные для нас: `Ref`, `Description`, `Number`, `WarehouseIndex`, `CityRef`, `CityDescription`,
`SettlementRef`, `SettlementAreaDescription`, `TypeOfWarehouse`, `CategoryOfWarehouse` (`Branch`/`Postomat`/…),
`Latitude`/`Longitude` (бывают перепутаны местами — наш синк это чинит), `PlaceMaxWeightAllowed`, `TotalMaxWeightAllowed`,
`ReceivingLimitationsOnDimensions`, `SendingLimitationsOnDimensions` (см), `WarehouseStatus`, `PostFinance`, `POSTerminal`, `Schedule`.

## Новый API

- `GET /settlements?countryCodes[]=UA&textSearch=…&limit=&page=` → `items[]{id, name, region{…}, externalId, postCode1/2, boost, prohibitedSending/Issuance}`.
  Поиск кириллицей «Київ» вернул сначала сёла «Київське»; латиницей `kyiv` — сразу `місто Київ` (`id=118064`, `boost=510`).
  Сортируйте по `boost` или ищите по названию с префиксом «місто». Харків: `id=133451`.
- `GET /divisions?countryCodes[]=UA&settlementIds[]=…&divisionCategories[]=Postomat|PostBranch|CargoBranch|PUDO&statuses[]=Working&limit=≤101&page=`
  (+ `latitude/longitude`, `prohibitedSending/Issuance`; заголовок `Accept-language: uk`).
  Пагинация Laravel-стиля: `current_page`, `last_page`, `per_page`, `total`. По UA всего 54 939 точек (2026-10-08, 550 страниц по 100) —
  для полного синка старый API выгоднее (500/стр, без ключа).
- `GET /streets?countryCodes[]=UA&name=…` — улицы (в песочнице не проверяли).
- `GET /dictionary/divisions`, `/dictionary/settlements/versions` — офлайн-выгрузки справочников (не проверяли).
- Виджет выбора отделения от NP (iframe, без ключа): `internal-solutions__division-selection-widget.md`.

Схемы: [reference/portal/methods__methods__dictionaries.md](reference/portal/methods__methods__dictionaries.md).

## Типы отделений

| Старый `TypeOfWarehouse` | Смысл | Новый `divisionCategory` | Источник |
|---|---|---|---|
| `9a68df70-0267-42a8-bb5c-37f427e36ee4` | Вантажне відділення (крупные, до 1100 кг) | `CargoBranch` | проверено (Харків №1) |
| `841339c7-591a-42e2-8233-7a0a00f0ed6f` | Поштове відділення (до 30 кг на місце) | `PostBranch` | наш код, Харків №7 «до 30 кг» |
| `f9316480-5f2d-425d-bc2c-ac7cd29decf0` | Поштомат | `Postomat` | проверено (№3158) |
| `6f8c7162-4b72-4b0a-88e5-906948c6a92f` | Пункт приймання-видачі (партнёрский) | `PUDO` | по памяти — сверить `getWarehouseTypes` |

⚠️ В `NovaPoshtaService` константа `TYPE_POINT = 9a68df70…` — это **вантажні** відділення, а не пункти. Фильтр карты
«point» сейчас показывает крупные отделения, а партнёрские пункты (`PUDO`) не попадают ни в одну категорию.

## Лимиты веса и габаритов

| Тип | На получение (одно место) | Объявленная ценность |
|---|---|---|
| Поштомат | 20 кг, 60×40×30 см (`maxWeightPlaceRecipient=20000`, `600×400×300` мм) | `maxDeclaredCostPlace=29000` (новый API, 2026-10); `carrier-api` пишет 10 000 — устарело |
| Поштове відділення | 30 кг, 120×70×70 см (Харків №7) | без лимита |
| Вантажне відділення | 1100 кг, 600×170×220 см (Харків №1) | без лимита |

Лимиты разные у конкретных точек — брать из `/divisions` (`max*PlaceRecipient`, `max*PlaceSender`) или из
`ReceivingLimitationsOnDimensions`/`PlaceMaxWeightAllowed` старого API (`0` = не задано). Сервер проверяет:
в поштомат с местом 70×45×35 см → 422 `Max param value sizes is 60`.
Поштомат принимает только `Parcel`/`Documents` (старый API, `ServiceType` = `WarehousePostomat`/`DoorsPostomat`).
