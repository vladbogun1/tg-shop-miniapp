# «Вместе дешевле» (bundles)

Скидка на аксессуары, которые покупают вместе с основным товаром: мышь + глайды/коврик,
коврик + рукав, клавиатура + кейкапы/кабель и т. п. uk «Разом дешевше», en «Better together».
Ветка `feat/bundles` (2026-10). Подарок за сумму и кейс — отдельная фича:
[`GIFT-CASE.md`](GIFT-CASE.md).

Зачем: средний чек ~2 370 ₴, многотоварных заказов 22 %; мышь + глайды — 4 заказа из 182,
коврик + рукав — 68 из 559. Дешёвые аксессуары недопродаются.

## Правила (решения владельца)

- **Пары категорий** — таблица `bundle_rules` (source → target). Правило на родительскую
  категорию ловит и подкатегории: «Коврики → Рукава» работает и для «Тканевых», и для «Стеклянных».
- **Аксессуар** — строка корзины из категории target, если в корзине есть товар из source
  подороже. Аксессуар стоит не больше `bundle.maxAddonPricePercent` % (по умолчанию 50 %)
  цены основного товара и строго дешевле его, поэтому две строки не бывают аксессуарами друг друга.
- **Скидка только на аксессуары**: 5 / 10 / 15 % за 1 / 2 / 3 шт. Скидка идёт на три самых
  дорогих аксессуара, четвёртый и дальше ступень не повышают. Скидка с единицы округляется вниз до
  целой гривны. Есть потолок на заказ `bundle.maxDiscountUah` (0 — без потолка).
- **Одна скидка на заказ**: комплект ИЛИ промокод, что выгоднее покупателю. Не суммируются.
  Проигравший промокод не списывается, его резерв снимается сразу (`promoService.release`).
- **Ручная скидка админа** заменяет комплект (`applyDiscount` обнуляет `bundle_discount_minor`
  и метки `bundle_addon`). При правке состава `recomputeTotals` не даёт скидке комплекта стать
  больше общей скидки.
- **Закупочных цен в системе нет**, поэтому маржа не считается. Защита от убытка — процент,
  предел цены аксессуара и потолок.

## Выключатель и настройки

Админка → **«Вместе дешевле»** (`/bundles`). Группа настроек `bundles` (в общих «Настройках»
спрятана карточкой-ссылкой):

| Ключ | По умолчанию | Что |
|---|---|---|
| `bundle.enabled` | true | **Главный выключатель.** Выключено: нет блока на товаре, нет предложений в корзине, скидка не считается ни в корзине, ни при оформлении |
| `bundle.tier1Percent` / `tier2Percent` / `tier3Percent` | 5 / 10 / 15 | % за 1 / 2 / 3 аксессуара |
| `bundle.maxAddonPricePercent` | 50 | аксессуар не дороже этой доли цены основного |
| `bundle.maxDiscountUah` | 0 | потолок скидки на заказ, ₴ (0 — нет) |
| `bundle.maxSuggestions` | 3 | сколько аксессуаров предлагать |

В разделе: правила-пары (добавить, вкл/выкл, порядок), «Превью» (что увидит покупатель на
странице товара, работает и при выключенной фиче) и статистика за 30 дней: заказы со скидкой,
сумма скидки, выручка.

## Как работает

**Предложения** (`BundleService.suggest`): для каждого товара корзины (сначала самые дорогие) и
каждого его правила по порядку берётся лучший товар категории target. Лучший — по продажам, потом
по числу отзывов, потом по цене. Товар должен быть в наличии, не дороже предела, его категории
ещё не должно быть в корзине. Предлагается по одному на правило за круг: к мыши сначала глайды И
коврик, и только потом вторые глайды.

**Расчёт** — `BundlePricing` (чистая функция, без Spring и базы). Ту же функцию вызывают корзина
(`quote`), оформление (`OrderService.createOrder` по заблокированным строкам товаров) и тесты,
поэтому цена в корзине совпадает с ценой заказа. На клиенте расчёт повторяет
`shared/src/bundle.ts` (`bundleDiscount`); страница товара считает свой блок сама, корзина берёт
итог у сервера.

**Оформление**: `createOrder` блокирует строки товаров по id (FOR UPDATE, в одном порядке, чтобы
не ловить дедлок), считает комплект и промокод и выбирает одно. Записывает
`orders.bundle_discount_minor` (часть `discount_minor`) и `order_items.bundle_addon = 1`.
Карточка заказа в канале показывает «(вместе дешевле)» у строки и «, «Вместе дешевле»» у скидки.

## API

| Метод | Путь | Что |
|---|---|---|
| GET | `/api/public/bundles/product/{id}` | `BundleProductOffer {productId, terms, items}`: аксессуары к товару и условия (ступени, пределы) |
| POST | `/api/public/bundles/quote` | тело `{lines, promoDiscountMinor}` → `BundleQuote`: скидка по строкам, какая скидка выигрывает (BUNDLE/PROMO), итог, предложения для корзины. Без входа (у гостей сайта тоже есть корзина), `permitAll` в SecurityConfig |
| GET/POST/PATCH/DELETE | `/api/admin/bundles/rules[/{id}]` | пары категорий (аудит `BUNDLE_RULE_*`) |
| GET | `/api/admin/bundles/preview?productId=` | блок товара глазами покупателя |
| GET | `/api/admin/bundles/stats` | 30 дней: orders, bundleOrders, bundleDiscountMinor, bundleRevenueMinor |

Аналитика: события `bundle_view` (блок показан; meta: place, productIds) и `bundle_add`
(аксессуар или весь набор добавлен) — `StructuredEvents`.

## База

`V57__bundles.sql`, только добавление: таблица `bundle_rules` со стартовыми 9 парами по
именам категорий (на пустой базе ничего не вставится), `orders.bundle_discount_minor`,
`order_items.bundle_addon`. Старый бэкенд эти колонки не читает → откат образами.

## Код

- Бэкенд: `backend/.../bundle/` — `BundlePricing` (арифметика), `BundleService` (настройки,
  правила, предложения, quote), `BundleController`, `AdminBundleController`/`AdminBundleService`,
  `BundleRule`/`BundleRuleRepository`, `BundleDtos`. В заказе: `OrderService.createOrder`
  (комплект или промокод), `applyDiscount`, `recomputeTotals`. Тесты: `BundlePricingTest`.
- Общий модуль: `shared/src/bundle.ts` (типы, `bundleDiscount`, `bundlePercent`, `bundleQuoteBody`).
- Mini App: `frontend/lib/bundle.ts`, `frontend/components/catalog/BundleBlock.tsx` (товар),
  `frontend/components/cart/BundleCart.tsx` (`BundleSuggestions` в корзине), сводка в
  `app/checkout/page.tsx`, метка в `app/account/orders/[id]/page.tsx`. Ключи i18n `bundle.*`.
- Сайт: `site/lib/bundle.ts`, `site/components/bundle/{BundleOffer,CartBundle}.tsx`, места в
  `BuyBox`, `CartDrawer`, `CartPageBody`, `CartLines`, `CheckoutView`, `OrderDetailView`.
  Ключи i18n `bundle.*`.
- Админка: `frontend-admin/app/bundles/` (page, RulesPanel, PreviewPanel),
  `components/ProductPickModal.tsx`, `lib/bundles.ts`, метка в `components/orders/OrderDetails.tsx`.

## Проверка

- `mvn test` (BundlePricingTest), typecheck всех приложений.
- Руками на стенде: мышь + глайды → 5 %, + коврик → 10 %; промокод на 5 % проигрывает комплекту и
  не списывается, промокод на 20 % выигрывает. При `bundle.enabled = false` блоков нет, скидки нет.

## Попутно в этом ПР

Админка: название товара в заказе в 2 строки вместо «…» на телефоне; в «Отправке» фото товаров
(`DispatchOrderDto.DispatchItem.imageUrl`, одним запросом на страницу), отделение НП не обрезается.
