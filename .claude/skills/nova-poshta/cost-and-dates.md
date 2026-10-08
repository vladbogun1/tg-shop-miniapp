# Стоимость и срок доставки

## Старый API (боевой, без песочницы)

> Поля — по `shopanaio/carrier-api` (`waybill.ts`) и практике; официальная страница недоступна автоматически.

### `InternetDocument.getDocumentPrice`

```json
{"apiKey":"<KEY>","modelName":"InternetDocument","calledMethod":"getDocumentPrice","methodProperties":{
  "CitySender":"<CityRef>","CityRecipient":"<CityRef>",
  "Weight":"1.5","ServiceType":"WarehouseWarehouse","Cost":"1500","CargoType":"Parcel","SeatsAmount":"1",
  "OptionsSeat":[{"weight":"1.5","volumetricWidth":"20","volumetricLength":"30","volumetricHeight":"10"}],
  "RedeliveryCalculate":{"CargoType":"Money","Amount":"1500"}
}}
```

Ответ `data[0]`: `Cost` (доставка, ₴), `AssessedCost` (оценочная), `CostRedelivery` (комиссия наложки, если передан `RedeliveryCalculate`),
`CostPack`, `TZoneInfo{TzoneName,TzoneID}`. Цена — для `PayerType` по умолчанию (без скидок договора? — проверить на нашем ключе).

- Город — `CityRef` (наш `np_city_ref`), а не `SettlementRef`.
- Для поштомата: `ServiceType: "WarehousePostomat"` (доплата за поштомат входит в цену).
- Вес: максимум из фактического и объёмного (`Д×Ш×В/4000` см → кг).

### `InternetDocument.getDocumentDeliveryDate`

```json
{"modelName":"InternetDocument","calledMethod":"getDocumentDeliveryDate","methodProperties":{
  "DateTime":"08.10.2026","ServiceType":"WarehouseWarehouse","CitySender":"<CityRef>","CityRecipient":"<CityRef>"}}
```

Ответ: `data[0].DeliveryDate = {"date":"2026-10-09 00:00:00.000000","timezone_type":3,"timezone":"Europe/Kiev"}` — плановая дата
(без учёта времени сдачи: после «відсічки» отделения добавьте день).

`InternetDocument.save` тоже возвращает `CostOnSite` и `EstimatedDeliveryDate` — после создания ТТН брать их.

## Новый REST — `POST /shipments/calculations` (песочница ✅)

Схема: [reference/portal/methods__methods__shipments__delivery-cost.md](reference/portal/methods__methods__shipments__delivery-cost.md).

```json
{
  "payerType": "Recipient",
  "sender":    {"countryCode":"UA","divisionId":7386,"name":"Тестовий Відправник","phone":"380000000000"},
  "recipient": {"countryCode":"UA","divisionId":10816,"name":"Тестовий Отримувач","phone":"380000000001"},
  "parcels": [{"rowNumber":1,"cargoCategory":"parcel","insuranceCost":3000,"actualWeight":2000,"length":300,"width":200,"height":150}]
}
```

→ `200 {"scheduledDeliveryDate":null,"sender":{"settlementId":133451,"divisionId":7386},"recipient":{"settlementId":118064,…},
"services":[{"payerType":"Recipient","paymentStatus":"NeedPay","price":150,"discount":0,"cost":150,…}]}`
([20-calc-ua-branch-to-branch.json](reference/sandbox-examples/20-calc-ua-branch-to-branch.json)).

Наблюдения (песочница, 2026-10-08):

| Маршрут | Вес / ценность | `cost` |
|---|---|---|
| Харків №1 → Харків №7 (отделения) | 0.5 кг / 1500 | 77.5 |
| Харків №1 → Київ №2 | 2 кг / 3000 | 150 |
| Харків №1 → поштомат Харків №3158 | 0.5 кг / 1500 | 140 |
| `POST /shipments` Харків → Київ, 1 кг (объёмный 1.5) / 1500 | — | 97.5 (90 + 7.5 страховка) |

- **`sender.name` обязателен** (2+ слова), хотя в схеме calculations его нет → иначе 422 `Contact Sender contains less than 2 words`.
- **Даты нет**: `scheduledDeliveryDate: null` (в `POST /shipments` — `0001-01-01T00:00:00Z`). Для UA срок брать из старого `getDocumentDeliveryDate`.
- Возвращается одна строка `services[]` с итоговой суммой; разбивку (доставка/страховка/поштомат) видно только в `GET /shipments` после создания.
- Тарифы песочницы не обязаны совпадать с боевыми (расчёт и фактическое создание дали разные суммы) — для витрины не использовать.
- Принимает `divisionId` (int) — нужен маппинг `Ref`→`id` (см. [directory.md](directory.md)).

## Рекомендация

Для витрины (подсказка «≈ доставка 80–150 ₴, завтра») — старый API: `getDocumentPrice` + `getDocumentDeliveryDate` по `CityRef`
из заказа, кэш по (город-отправитель, город-получатель, тип, весовая ступень) на сутки. Новый API для UA даты не даёт.
