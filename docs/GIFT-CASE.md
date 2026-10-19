# Подарок за сумму и кейс (gift case)

За заказ от порога магазин сам кладёт подарок. Подарок бывает двух видов: один заданный товар или
**кейс как в CS** — приз выпадает случайно из пула, покупатель после оплаты открывает кейс, лента
крутится и останавливается на призе. Ветка `feat/gift-case` (2026-10), стоит поверх
`feat/bundles` («Вместе дешевле» — [`BUNDLES.md`](BUNDLES.md)), но от неё не зависит: каждая
фича включается своим выключателем.

## Правила (решения владельца, против абуза)

- **Приз определяет только сервер**, при оформлении заказа (или когда админ выдаёт кейс):
  `SecureRandom`, взвешенный выбор среди призов **в наличии**. Клиент получает уже выпавший приз,
  лента — только анимация (`buildCaseReel` ставит приз на 48-ю плитку). Подменить приз с клиента
  нельзя.
- **Открыть можно только после оплаты** (`OrderService.giftCaseOpenable`: статус SEALED, заказ не
  REJECTED и `paid` или онлайн-часть пришла и к оплате 0). Иначе можно было бы заказать,
  посмотреть приз и отменить. До открытия покупатель не видит строку приза: `OrderQueryService`
  прячет её для покупателя. В корзине monobank приза тоже нет: строки с ценой 0 в чек не идут.
- **Открыть можно один раз**, пересмотров нет: SEALED → OPENED, повторный запрос → 400
  `GIFT_CASE_ALREADY_OPENED`; неоплаченный → 400 `GIFT_CASE_UNPAID`; без кейса → `GIFT_CASE_NONE`.
- **Склад**: приз сразу кладётся в заказ строкой `gift = 1, auto_gift = 1, case_rarity`, цена 0,
  вариант с наибольшим остатком, остаток резервируется как у обычной строки. Склад и сборка видят
  его сразу. Если кто-то купил последний экземпляр приза, приз пропадает из кейса, а его шанс
  делится между остальными: шансы всегда пересчитываются по призам в наличии.
- **Кейс или товар**: если кейс включён и хоть один приз в наличии, выдаётся кейс. Если ни одного
  нет, выдаётся запасной товар-подарок (`gift.productId`), если он задан и есть в наличии. Если и
  его нет, заказ уходит без подарка.
- **Порог** сравнивается с итогом заказа ПОСЛЕ скидки (комплекта или промокода).
- **Шанс** хранится как вес в миллионных: 1 = 0,0001 %, 1 000 000 = 100 % (`CASE_WEIGHT_PER_PERCENT
  = 10 000`). Показывается с точностью до 4 знаков. Друг владельца предлагал дорогой мыши
  0,001–0,0001 %.
- Админ может **выдать кейс** любому заказу (кнопка «🎁 Выдать кейс» в заказе): приз
  разыгрывается сразу, бот пишет покупателю, что ему подарили кейс, но приз не называет. Второй
  кейс одному заказу выдать нельзя.
- Если админ удалит строку приза из заказа, кейс у заказа пропадёт (`removeItem` сбрасывает
  статус).

## Выключатели и настройки

Админка → **«Кейс»** (`/gift`). Группа настроек `gift` (в общих «Настройках» спрятана
карточкой-ссылкой):

| Ключ | По умолчанию | Что |
|---|---|---|
| `gift.enabled` | false | **Главный выключатель подарка за сумму.** Выключено: ни баннеров, ни прогресса в корзине, ни подарка в заказе |
| `gift.thresholdUah` | 3000 | порог, ₴, по итогу после скидки |
| `gift.caseEnabled` | false | подарок — кейс (иначе один товар) |
| `gift.productId` | — | товар-подарок; в режиме кейса это запасной вариант, если призов нет в наличии |

В разделе: статистика за 30 дней (заказы с подарком, с кейсом, кейсов открыто), настройки и
**призы кейса** (`CasePanel`): товар из каталога, редкость (COMMON / RARE / EPIC / LEGENDARY /
GOLD — цвет рамки как в CS), шанс в %, порядок, вкл/выкл. Видно фактический шанс среди призов в
наличии, остаток, сумму шансов и среднюю стоимость приза. Выдача кейса заказу —
`components/orders/GiftCaseModal.tsx`.

## Что видит покупатель (сайт и Mini App одинаково)

- **Товар** (`ProductGiftBanner`): если товар дороже порога — «🎁 З цим товаром — кейс у
  подарунок: після оплати відкриєте й виб'єте ще девайс», иначе «Замовлення від 3 000 ₴ — кейс з
  дропом» и сколько добрать. Под этим тизер самого редкого приза («Можна вибити: …») и
  раскрывающийся список «Що може випасти» с шансами.
- **Корзина** (`CartGiftProgress`): «Купіть ще на N ₴ — і отримаєте кейс з дропом» с полосой
  прогресса, по достижении — «🎉 Вітаємо! …» и светящийся кейс.
- **Оформление**: строка «🎁 Кейс з подарунком» в сводке, кнопка «Оформити + 🎁 кейс».
- **Заказ**: до оплаты кейс под замком («відкриється після оплати»), после оплаты кнопка
  «Відкрити кейс». Сразу после оплаты экран открытия запускается сам (`markGiftCaseAutoOpen`).
  Открытие идёт на весь экран: лента, звук (`case-audio`), частицы и вспышка по редкости
  (`case-particles`), вибрация в Telegram. В списке заказов бейдж «🎁 Кейс чекає / після оплати».
- **Бот**: в сообщении о статусе есть строка про кейс; когда админ выдаёт кейс, приходит
  отдельное сообщение.

Прогресс («купите ещё на N») клиент считает сам: `giftProgress(useGift(), итог)`, где итог —
`quote.totalMinor` корзины или подытог минус промокод; на странице товара итог — цена товара.
Сервер при оформлении всё проверяет заново.

## API

| Метод | Путь | Что |
|---|---|---|
| GET | `/api/public/gift` | `{gift: GiftInfo \| null}`: `thresholdMinor`, `kind` PRODUCT/CASE, `product`, `caseItems` (призы в наличии с шансами). Без входа |
| POST | `/api/me/orders/{id}/gift-case/open` | открыть кейс своего заказа → `{status, won, reel}`; журнал `GIFT_CASE_OPENED` |
| GET/POST/PATCH/DELETE | `/api/admin/gift/case-items[/{id}]` | призы кейса (аудит `GIFT_CASE_ITEM_*`) |
| GET | `/api/admin/gift/stats` | 30 дней: orders, giftOrders, caseOrders, casesOpened |
| POST | `/api/admin/orders/{id}/gift-case` | выдать кейс (`{notifyCustomer}`); аудит `ORDER_GIFT_CASE` |

Поля заказа: `OrderSummary/OrderDetail.giftCaseStatus` (null / SEALED / OPENED),
`giftCaseOpenedAt`, `giftCaseOpenable`; у позиции — `autoGift`, `caseRarity`. Событие аналитики
`gift_case_open` (meta: orderId, rarity).

## База

`V58__gift_case.sql`, только добавление: таблица `gift_case_items` (product_id уникален, FK на
products с каскадом), `orders.gift_case_status`, `orders.gift_case_opened_at`,
`order_items.auto_gift`, `order_items.case_rarity`. Колонок V57 миграция не касается.

## Код

- Бэкенд, пакет `backend/.../gift/`:
  - `GiftService` — настройки, пул, `draw`, шансы, `info` для витрины;
  - `GiftCaseService` — открытие;
  - `GiftController`, `AdminGiftController` / `AdminGiftService`;
  - `GiftCaseItem` (enum `Rarity`) / `GiftCaseItemRepository`, `GiftDtos`.
- Бэкенд, в заказе — `OrderService`:
  - `createOrder`: строки призов блокируются в том же порядке по id, что и корзина; приз разыгрывается после скидки;
  - `addThresholdGift`, `giftable`, `openGiftCase`, `giftCaseOpenable`, `grantGiftCase`, `removeItem`.
- Бэкенд, остальное:
  - `OrderQueryService` прячет запечатанный приз;
  - `NotificationService.notifyCustomerGiftCase` и строка в статусе, `OrderEvents.EditKind.GIFT_CASE`;
  - `MeController` / `AdminOrderController`;
  - i18n `api.giftCase.*`, `bot.giftCase.*`.
- Бэкенд, тесты: `GiftCaseDrawTest`, `GiftCaseOpenableTest`.
- `BundleService.suggest` не предлагает за деньги товары, которые раздаются в подарок (`GiftService` подключается через setter).
- Общий модуль:
  - `shared/src/giftcase.ts` — типы, `giftProgress`, `buildCaseReel`, `caseReelOffset`, `formatCaseChance`, `rarestCasePrize`, цвета редкостей, `giftCaseOpenErrorCode`;
  - `shared/src/ui/` — экспорт `@shop/shared/case-ui`: `GiftCaseOpening` (экран открытия), `GiftCaseParts`, стили, звук, частицы.
- Mini App:
  - `frontend/lib/gift.ts` (`useGift`, react-query `["gift", locale]`);
  - `frontend/components/case/{OrderGiftCase,CartGiftProgress,ProductGiftBanner}.tsx`;
  - места в `app/cart`, `app/checkout`, `ProductView`, `app/account`;
  - ключи `case.*` одним блоком в `i18n/*.ts`.
- Сайт:
  - `site/lib/gift.ts`;
  - `site/components/case/{OrderGiftCase,CartGiftProgress,ProductGiftBanner,CheckoutGiftLine}.tsx`;
  - места в `BuyBox`, `CartDrawer`, `CartPageBody`, `CheckoutView`, `OrderDetailView`, `OrdersList`, `order/Payment.tsx`;
  - ключи `case.*`.
- Админка:
  - `frontend-admin/app/gift/{page,CasePanel}.tsx`, `lib/gift.ts`;
  - `components/orders/GiftCaseModal.tsx`, метки в `OrderDetails` / `OrderDrawer`;
  - пункт меню в `Shell`.
- Арт (ChatGPT, скилл gpt-image):
  - `{frontend,site}/public/case/` — case-closed, case-open, case-closed-sm, scene-wide, scene-tall (webp);
  - промпты — `docs/case-art/`.

## Проверка

- `mvn test`: розыгрыш учитывает веса и наличие, нет призов → пусто; открывается только после
  оплаты.
- Руками через API на стенде: заказ ≥ порога → SEALED, строки приза у покупателя не видно; open
  до оплаты → `GIFT_CASE_UNPAID`; после оплаты open → приз; повторно → `GIFT_CASE_ALREADY_OPENED`;
  отмена заказа возвращает приз на склад; второй «Выдать кейс» тому же заказу → ошибка.

## Перед продом

Включено по умолчанию ничего не будет (`gift.enabled = false`). Владелец выбирает реальный пул
призов, шансы и порог. На демо 13.10 стоял тестовый пул из 8 призов: три по ≈25 %, два по 10 %,
3,8 %, 0,6 %, мышь 0,0013 %; средний приз ≈ 300 ₴ при пороге 3 000 ₴.
