# ТТН (експрес-накладні): создание, правка, удаление, печать, реестр, курьер

## Какой API для UA-магазина (ФОП)

| Нужно | Старый API 2.0 | Новый REST |
|---|---|---|
| Создать ТТН отделение/поштомат | ✅ `InternetDocument.save` | ✅ `POST /shipments` (песочница: 201) |
| Создать ТТН на адрес | ✅ (`ServiceType: WarehouseDoors`, адрес контрагента или `NewAddress`) | ❌ в песочнице 422 (`RecipientCityName not selected…`) |
| Наложенный платёж (грошовий переказ) | ✅ `BackwardDeliveryData` | ❌ для UA `services[COD]` молча игнорируется |
| Контроль оплати | ✅ `AfterpaymentOnGoodsCost` (договор) | нет аналога для UA |
| Правка | ✅ `InternetDocument.update` | ❌ `PUT` → `Vip not found in Ukraine` (тест-ключ физлица) |
| Удаление | ✅ `InternetDocument.delete` | ✅ `DELETE /shipments/{id}` |
| Печать маркировки | ✅ ссылки `my.novaposhta.ua/orders/print…` | ❌ UA в песочнице: `Server error` / `Print is not supported` |
| Реестр | ✅ `ScanSheetGeneral` | `/registry` (UA «MEN/ID») — не проверяли |
| Курьер (забор) | `getPickupTimeIntervals` + кабинет | `/pickups` (UA, UUID) — не проверяли |
| Песочница | нет | есть |

**Вывод для этапа 3:** создавать ТТН через старый API бизнес-ключом ФОП. Новый — только когда NP официально переведёт UA-внутрянку
(сейчас сайт: «международный API постепенно расширяется на внутренние отправки»).

---

## Старый API 2.0 — `InternetDocument` (модель `InternetDocument` / `InternetDocumentGeneral`)

> Источник: официальная дока недоступна автоматически (Cloudflare); поля сверены по клиенту
> `shopanaio/carrier-api` (`packages/novaposhta-api-client/src/types/waybill.ts`, Apache-2.0) и практике. Перед внедрением
> проверить на боевом ключе одним `save` + `delete`.

### Отправитель (один раз, кэшировать)

1. `Counterparty.getCounterparties` `{"CounterpartyProperty":"Sender","Page":"1"}` → `data[0].Ref` = **`Sender`** (наш ФОП).
2. `Counterparty.getCounterpartyContactPersons` `{"Ref":"<Sender>"}` → `Ref` = **`ContactSender`**, `Phones` = **`SendersPhone`**.
3. `CitySender` = `CityRef` города отправки; `SenderAddress` = `Ref` отделения отправки (для `Warehouse*`) или `Ref` адреса контрагента (`Counterparty.getCounterpartyAddresses`) для `Doors*`.
   Новее: можно `SenderWarehouseIndex` (`"38/1"`) вместо `SenderAddress`.

Контактные лица: `ContactPerson.save` / `update` / `delete` (`CounterpartyRef`, `FirstName`, `LastName`, `MiddleName`, `Phone`, `Email`).

### Получатель

- Классика: `Counterparty.save` `{"CounterpartyProperty":"Recipient","CounterpartyType":"PrivatePerson","FirstName","LastName","MiddleName","Phone"}` →
  `data[0].Ref` = `Recipient`, `data[0].ContactPerson.data[0].Ref` = `ContactRecipient`. Повторный `save` с тем же телефоном
  возвращает существующего.
- `CityRecipient` = `orders.np_city_ref`, `RecipientAddress` = `orders.np_warehouse_ref` (или `RecipientWarehouseIndex`).
- `RecipientsPhone` — `380XXXXXXXXX`.

### `InternetDocument.save` — минимальный набор (отделение → отделение)

```json
{
  "apiKey": "<UA_BUSINESS_KEY>",
  "modelName": "InternetDocument",
  "calledMethod": "save",
  "methodProperties": {
    "PayerType": "Recipient",
    "PaymentMethod": "Cash",
    "DateTime": "08.10.2026",
    "CargoType": "Parcel",
    "Weight": "1",
    "ServiceType": "WarehouseWarehouse",
    "SeatsAmount": "1",
    "Description": "Аксесуари для комп'ютера",
    "Cost": "1500",
    "CitySender": "<CityRef>", "Sender": "<CounterpartyRef>", "SenderAddress": "<WarehouseRef>",
    "ContactSender": "<ContactRef>", "SendersPhone": "380XXXXXXXXX",
    "CityRecipient": "<CityRef>", "Recipient": "<CounterpartyRef>", "RecipientAddress": "<WarehouseRef>",
    "ContactRecipient": "<ContactRef>", "RecipientsPhone": "380XXXXXXXXX",
    "OptionsSeat": [{"volumetricWidth":"20","volumetricLength":"30","volumetricHeight":"10","weight":"1"}]
  }
}
```

Ответ: `data[0]` = `{Ref, IntDocNumber, CostOnSite, EstimatedDeliveryDate, TypeDocument}`. Сохранить **`Ref`** (для update/delete/реестра)
и **`IntDocNumber`** (= `orders.tracking_number`).

Значения:
- `PayerType`: `Sender` | `Recipient` | `ThirdPerson` (+ `ThirdPerson: <CounterpartyRef>`). При `Recipient` — только `PaymentMethod: "Cash"`.
- `PaymentMethod`: `Cash` | `NonCash` (безнал — только по договору).
- `ServiceType`: `WarehouseWarehouse`, `WarehouseDoors`, `DoorsWarehouse`, `DoorsDoors`, `WarehousePostomat`, `DoorsPostomat`.
- `CargoType`: `Parcel`, `Documents`, `Cargo`, `TiresWheels`, `Pallet` (в поштомат — только `Parcel`/`Documents`).
- `OptionsSeat` — **ключи в lowerCamelCase**, хотя всё остальное PascalCase; см и кг. Для поштомата обязательно, ≤ 60×40×30 см, ≤ 20 кг.
- `Cost` — объявленная ценность (влияет на страховой сбор ~0.5%; в песочнице нового API: 1500 ₴ → 7.5 ₴).
- `DateTime` — дата отправки `dd.mm.yyyy`, не в прошлом.
- Доп. поля: `InfoRegClientBarcodes` (наш номер заказа, виден в трекинге), `AdditionalInformation`, `PreferredDeliveryDate`, `TimeInterval`
  (`CityDeliveryTimeInterval1..4`), `SaturdayDelivery`, `RedBoxBarcode`.

### Наложений платіж vs «Контроль оплати»

| | `BackwardDeliveryData` (наложка, «грошовий переказ») | `AfterpaymentOnGoodsCost` («Контроль оплати») |
|---|---|---|
| Кому | любой отправитель, в т.ч. без договора | только по договору (ФОП/юрлицо) с подключённой услугой |
| Куда деньги | наличными/на карту получателю-отправителю через NP (переказ) | на расчётный счёт ФОП из договора |
| Поле | `"BackwardDeliveryData":[{"PayerType":"Recipient","CargoType":"Money","RedeliveryString":"1500"}]` | `"AfterpaymentOnGoodsCost":"1500"` (в корне `methodProperties`) |
| Комиссия | по тарифу переказа (платит `PayerType` из блока) | по договору |
| Трекинг | `StatusCode` 10 → 11 (переказ отправлен/получен), `RedeliverySum`, `LastTransactionStatusGM` | `AfterpaymentOnGoodsCost` в `getStatusDocuments` |

Одновременно оба для денег не ставить. Ограничения/ошибки — коды `20000200031…20000200040` (Afterpayment*) в `carrier-api` `errors.ts`.
Расчёт комиссии переказа: `getDocumentPrice` с `RedeliveryCalculate:{"CargoType":"Money","Amount":"1500"}` → `CostRedelivery`.

### Правка / удаление / список

- `InternetDocument.update` — `Ref` + **полный** набор полей как в `save`. Возможна только до сканирования в отделении.
- `InternetDocument.delete` — `{"DocumentRefs":["<Ref>"]}` (строка или массив). Тоже только до отправки.
- `InternetDocument.getDocumentList` — `{"DateTimeFrom":"01.10.2026","DateTimeTo":"08.10.2026","Page":"1","GetFullList":"1"}` →
  `Ref`, `IntDocNumber`, `StateName`/`StatusDescription`, `CostOnSite`, `EstimatedDeliveryDate` — сверка «что создано в кабинете».

### Печать (старый API — ссылки, а не методы)

> По памяти/сторонним клиентам, сверить на боевом ключе. В URL уходит **apiKey** — открывать только через наш backend (прокси), не отдавать ссылку в браузер.

- Маркировка 100×100 PDF: `https://my.novaposhta.ua/orders/printMarking100x100/orders[]/<IntDocNumber>/type/pdf/apiKey/<KEY>`
- Маркировка 85×85 / для Zebra: `printMarking85x85/…/type/pdf8/…`, `printMarking100x100/…/zebra/zebra/…`
- Експрес-накладна A4: `https://my.novaposhta.ua/orders/printDocument/orders[]/<IntDocNumber>/type/pdf/apiKey/<KEY>`
- Несколько ТТН: `orders[]/<n1>,<n2>` или повтор `orders[]`.
- Настройка Zebra: `reference/portal/methods__nalashtuvannya-printera-zebra-dlya-druku-markuvannya-nova-post.md`.

### Реєстр (ScanSheet)

Модель `ScanSheet` / `ScanSheetGeneral`:
- `insertDocuments` `{"DocumentRefs":["<Ref>",…],"Ref":"<ScanSheetRef — если добавить в существующий>","Date":"08.10.2026"}` → `data[0].Ref`, `Number`;
- `getScanSheetList`, `getScanSheet {Ref, CounterpartyRef}`, `removeDocuments {DocumentRefs, Ref}`, `deleteScanSheet {ScanSheetRefs}`;
- печать: `https://my.novaposhta.ua/scanSheet/printScanSheet/refs[]/<ScanSheetRef>/type/pdf/apiKey/<KEY>`.

Реестр нужен при сдаче пачки посылок курьеру/в отделение — для пары заказов в день не обязателен.

### Курьерский забор

`CommonGeneral.getPickupTimeIntervals` (`SenderCityRef`, `DateTime`) — интервалы; сам вызов курьера в 2.0 — через кабинет.
В новом API — `POST /pickups` (UA: UUID, номер `102-00328539`), см. `reference/portal/methods__methods__pickups.md` (не проверяли).

---

## Новый REST — `POST /shipments` (UA внутренние)

Схема: [reference/portal/methods__methods__shipments__create-shipments__domestic-shipments-within-ukraine.md](reference/portal/methods__methods__shipments__create-shipments__domestic-shipments-within-ukraine.md).

Рабочий запрос из песочницы ([30-shipment-create-ua.json](reference/sandbox-examples/30-shipment-create-ua.json)):

```json
{
  "status": "ReadyToShip",
  "clientOrder": "TEST-1001",
  "note": "test",
  "payerType": "Recipient",
  "sender":    {"countryCode":"UA","divisionNumber":"38/1","name":"Тестовий Відправник","phone":"380000000000"},
  "recipient": {"countryCode":"UA","divisionNumber":"11/2","name":"Тестовий Отримувач","phone":"380671234567"},
  "parcels": [{"rowNumber":1,"cargoCategory":"parcel","parcelDescription":"Аксесуари для комп'ютера",
               "insuranceCost":1500,"actualWeight":1000,"length":300,"width":200,"height":100}]
}
```

→ `201 {"id":"01a11ad1-…","number":"20400554016016","status":"ReadyToShip","cost":97,…,"services":[…],"parcels":[…]}`.

- Обязательные: `payerType`, `sender{countryCode,name,phone}+divisionNumber|divisionID|addressParts`, `recipient{…}`, `parcels[]{rowNumber,cargoCategory,parcelDescription,insuranceCost≥1,width,length,height (мм),actualWeight (г)}`.
  `invoice` в схеме помечен обязательным, но для UA→UA не нужен (создалось без него). `clientOrder` виден в трекинге (`alternativeNumbersGW`).
- `name` — 2+ слова (иначе «Contact … contains less than 2 words»).
- `divisionNumber` = `WarehouseIndex` (`"38/1"`); альтернатива — `divisionID` (int `id` из `/divisions`).
- `companyName` у физлица сервер ставит `"Приватна особа"`; для ФОП/юрлица — `companyTin` + `companyName` (в песочнице не проверить — ключ без организации).
- `payerContractNumber` нужен при безнале/`ThirdPerson`.
- COD (`services[{serviceCode:"COD",…}]`) — по доке только PL/CZ/DE→UA и т.п.; для UA→UA сервер вернул 201 и **выбросил** услугу.
- Ответ `GET /shipments?numbers[]=` содержит расшифровку тарифа: «Доставка посилок по Україні» / «…Локал», «Доплата за доставку у поштомат» (+10 ₴), «Комісія від оголошеної цінності» (0.5%).
- `DELETE /shipments/{id}` (UUID, не номер!) → `{"success":true}`; повторно → 422 `shipment_was_deleted`; по номеру → 404 `shipment_not_found`. После удаления в трекинге статус `2` «Скасовано».
- Печать: `GET /shipments/print?numbers[]=…&type=marking[&format=pdf|zpl&dpi=203|300&printSizeType=…]` → `application/pdf` или ZPL
  (ZPL только EU-EU/EU-UA). Для UA в песочнице не работает.
