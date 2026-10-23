# Нова пошта — отправка в Европу (разбор 2026-10-23)

Статус: **исследование**, ничего не создавали. Пути `portal/…` = `.claude/skills/nova-poshta/reference/portal/…`.
Непроверенное помечено «?».

## Коротко

- **Можно**, но нужен **отдельный договор на международку**: на нашем ключе ФОП `InternationalDeliveryContract=false` (проверено 2026-10-23).
- **Наложки/«при получении» в ЕС нет** (COD только PL/CZ/DE/SK→UA и внутри CZ/PL/DE) → только **предоплата онлайн**.
- Пошлины и НДС по умолчанию платит получатель (**DAP**). DDP/IOSS — потом, когда будет объём.
- Старт: **PL, CZ, LT, DE** (плотнее всего сеть НП), отделения/поштоматы/адрес.
- Ориентир цены: «Європа від 385 ₴», 5 кг в Германию ≈ 1400 ₴ (публичный тариф; для ФОП по договору — ?). Срок от 3 дней.

## API и ключ

- `api.novaposhta.ua/v.1.0` — «Украина и международные из Украины»; `api.novapost.com/v.1.0` — все направления
  (`portal/novaposhta-docs__integration-guide__how-to-choose-the-appropriate-endpoint.md`).
- Создание: `POST /shipments` по схеме `portal/methods__methods__shipments__create-shipments__cross-border-shipments-from-ukraine.md`.
- Ключ: договор → физлицо-представитель регистрируется в my.novapost.com → менеджер привязывает к организации →
  Integrations → API Keys (`portal/novaposhta-docs__integration-guide__api-key-generation.md`). Подходит ли наш UA-ключ — **?** (спросить менеджера).
- Песочница есть, но тест-ключ без организации — ТТН от ФОП UA→EU там не проверить.

## Что нужно в ТТН

- `invoice`: `incoterm` DAP/DDP, `payerFeesCustoms`, `exportReason: Selling`, `currency`, `cost`,
  `items[]{name, nameEng, hsCode, material(Eng), madeInCountryCode, producerAndModel, actualWeight (г), amount, cost}`.
- `parcels[]`: размеры мм, вес г, `insuranceCost` + валюта.
- `sender`: ФОП (`companyTin`, `companyName`, `registrationAddressParts`), отделение отправки.
- `recipient`: имя (2+ слова, латиницей), телефон, email, `countryCode`, `divisionId` (точка из `/divisions?countryCodes[]=PL`)
  или `addressParts{city, street, building, flat, postCode}`.
- После создания — проверка МЕН: `GET /shipments/international/status` (NotVerified/Verified/Rejected).
- Лимиты: посылка до 30 кг; пороги стоимости для оплаты пошлин отправителем — `GET /dictionary/customs-fees/{country}`.

## Цена, печать, трекинг, возврат

- `POST /shipments/calculations` — доставка + оценка пошлин/НДС для 16 стран (по `hsCode`, IOSS, типу получателя).
- Печать: `GET /shipments/print?type=marking` (PDF; ZPL для UA→EU — ?), `type=international`/`invoice` — таможенные документы.
- Трекинг и вебхуки — общие методы нового API.
- Возврат — только Light Return в отделение НП (услуга включается менеджером).

## Что придётся сделать у нас

- Каталог: **название EN** (есть переводы), **HS-код** (мыши/клавиатуры 8471 60, коврики 3926/5903 — подтвердить у брокера),
  **страна производства**, материал, вес/габариты (нужны и для Украины, этап 0 основного плана).
- Оформление заказа: страна → точка НП из `/divisions` или адрес латиницей, email обязателен, цены в EUR (?) или UAH,
  предупреждение «мито та ПДВ сплачує отримувач».
- Оплата: только онлайн. monobank принимает иностранные карты (комиссия ~2% — ?), валюта зачисления — ?.
- Админка: «Створити міжнародну ТТН» (инвойс из позиций заказа), печать этикетки + инвойса, статус МЕН.

## Риски и вопросы (до запуска)

1. **Беспроводные мыши/клавиатуры (радиомодули, CE/RED) и литиевые аккумуляторы** — ограничения пересылки и ввоза в ЕС. Главный риск.
2. Тарифы UA→EU для ФОП по договору, сроки, страхование.
3. ФОП 3 группы: экспорт товаров, валютная выручка, КВЭД — к бухгалтеру. Декларирование посылок делает НП как экспресс-перевозчик (?).
4. Занижение стоимости в инвойсе > 20% таможня корректирует — ставить реальную цену.
5. Возвраты из ЕС дорогие — продумать политику возврата для иностранцев.

## Рекомендуемый порядок

1. Договор + ключ my.novapost.com; вопросы 1–3 менеджеру НП и бухгалтеру.
2. MVP вручную: 2–4 страны, предоплата, ТТН в кабинете my.novapost.com, на сайте — «доставка в ЄС за запитом» / форма.
3. Если пойдут заказы — автоматизация по образцу украинского этапа 2 (создание ТТН с инвойсом, печать, трекинг).

Источники: novaposhta.ua/international_delivery, …/send/international-delivery/shipping-cost/, …/customs-clearance/,
novaposhta.ua/en/for-business/international-delivery (+ /ioss), monobank.ua/acquiring; документы портала выше.
