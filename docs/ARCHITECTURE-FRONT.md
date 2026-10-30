# Целевая архитектура фронтов tg-shop-v2 — УТВЕРЖДЕНО 30.10.2026

**Статус: утверждено владельцем 30.10.2026 (решения — раздел 4). Переделка ПОЛНАЯ, не частичная: в конце нет старых паттернов, исключений и baseline.** Основа — ветка `origin/arch/v2` (коммит `0243500a`, бэкенд уже переехал по
`docs/ARCHITECTURE.md`), обмер сделан на этом коммите. Образец формы — архитектура бэкенда: модули по смыслу, слои, «одна задача — один способ»,
проверки в CI с храповиком «только вниз», цель — ноль исключений.

Охват: `frontend/` (Mini App), `frontend-admin/` (админка), `site/` (сайт), `shared/`, `e2e/`. Ограничения, которые нельзя ломать, собраны в разделе 2.9.

---

## 1. Аудит (числа на `0243500a`)

### 1.1. Размер

| Пакет | Файлов ts/tsx | Строк ts/tsx | Файлов > 500 строк | Файлов > 300 | Что внутри |
|---|---|---|---|---|---|
| `frontend-admin` | 228 | 54 534 | 25 | 60 | 29 страниц, 136 компонентов, 46 файлов `lib/` |
| `site` | 160 | 22 725 | 8 | 22 | `app/[locale]` (32 файла), 83 компонента, 30 `lib/` |
| `frontend` (Mini App) | 87 | 17 481 | 10 | 16 | 14 файлов `app/`, 49 компонентов, 19 `lib/` |
| `shared` | 37 | 6 094 | 3 | 7 | деньги, даты, http, типы, i18n-ядро, анимация кейса |
| `e2e` | 46 | 4 696 | — | — | 38 спек **только админки** |
| Итого (без e2e) | 512 | ≈ 100 800 | 46 | 105 | + 2 666 строк CSS |

Бэкенд для сравнения: 56 тыс. строк Java. Админка по объёму — главный фронт, и в ней же меньше всего структуры.

### 1.2. Топ-20 самых длинных файлов (ts/tsx, кроме словарей)

| # | Файл | Строк |
|---|---|---|
| 1 | `frontend-admin/components/products/ProductModal.tsx` | 1 404 |
| 2 | `frontend-admin/lib/api.ts` | 1 392 |
| 3 | `frontend/app/checkout/page.tsx` | 1 207 |
| 4 | `frontend-admin/components/layout/Shell.tsx` | 1 125 |
| 5 | `frontend-admin/app/admins/page.tsx` | 1 083 |
| 6 | `frontend-admin/components/cards/ReviewPanel.tsx` | 984 |
| 7 | `frontend-admin/components/orders/ReturnModal.tsx` | 948 |
| 8 | `site/components/catalog/CatalogFilters.tsx` | 943 |
| 9 | `frontend-admin/app/products/page.tsx` | 900 |
| 10 | `frontend/app/account/orders/[id]/page.tsx` | 872 |
| 11 | `frontend-admin/components/orders/OrderDrawer.tsx` | 871 |
| 12 | `frontend-admin/lib/card-check.ts` | 868 |
| 13 | `frontend-admin/components/catalog/AttributeDialog.tsx` | 847 |
| 14 | `frontend-admin/components/journal/ActivityTab.tsx` | 809 |
| 15 | `shared/src/ui/GiftCaseOpening.tsx` | 793 |
| 16 | `site/components/checkout/CheckoutView.tsx` | 771 |
| 17 | `frontend-admin/components/orders/OrderDetails.tsx` | 743 |
| 18 | `frontend-admin/components/translations/AiTranslate.tsx` | 726 |
| 19 | `frontend-admin/app/broadcasts/page.tsx` | 721 |
| 20 | `frontend-admin/components/catalog/CategoryDialog.tsx` | 705 |

Ещё: `frontend/app/page.tsx` 692, `frontend-admin/app/users/page.tsx` 692, `site/lib/*` и `frontend/lib/telegram.ts` 572.

### 1.3. Главные проблемы

**П1. Один и тот же покупательский код написан дважды — в Mini App и на сайте.** 36 файлов с одинаковыми именами лежат и в `frontend/`, и в `site/`
(`cart.ts`, `cart-sync.ts`, `analytics.ts`, `api.ts`, `compare.ts`, `order-limits.ts`, `ws.ts`, `image.tsx`, `ProductCard`, `MessageBubble`, `NpCombobox`,
`PromoField`, `OrderGiftCase`, `StatusTimeline`, `ProductReviews`, `ReviewForm`…): **4 819 строк в Mini App против 4 758 на сайте**; `order-limits.ts` и
`ws.ts` почти совпадают построчно, `cart-sync.ts` 226 против 265 строк, расходятся они уже не по смыслу, а по случайности. Словари:
338 общих ключей из 569 (Mini App) и 786 (сайт), у **291 из 335** общих ключей текст одинаковый — то есть переводятся дважды.
Исправление ошибки в одном приложении не доезжает до второго (так уже было с `http.ts`, поэтому он ушёл в `shared`).

**П2. Состояние сервера — react-query, но «как попало».** react-query стоит во всех трёх приложениях (184 `useQuery`, 14 `useMutation`), но:
- **335 `queryKey:`, из них 221 (66 %) — строковый литерал на месте** (`["products", …]` в админке 21 раз), остальные — самодельные константы в разных стилях
  (`REVIEWS_QUERY_KEY`, `PREORDERS_KEY`, `["metrics2", …]`). Инвалидация (`invalidateQueries` 141) работает по совпадению строк — опечатка молча ничего не обновляет.
- **Мутаций через `useMutation` 14, а блоков `catch` — 333** (admin 185, site 77, Mini App 71): записи делаются руками (`try { await api… ; toast } catch (e) { toast.error(e.message) }`),
  у каждого экрана своё поведение при ошибке (`e.message` — 168 мест), нет единого «ждём → блокируем кнопку → инвалидируем → показываем ошибку».
- Три разных набора по умолчанию (`staleTime` 15 с в админке, 30 с на двух других), 83 `staleTime`-литерала и 27 `refetchInterval`-литералов по экранам.
- Прямой `fetch(` мимо `HttpClient`: 8 мест (admin `api.ts` ×2, `costing.ts`, `preorders.ts`; Mini App `analytics.ts`, `api.ts`; site `analytics.ts`, `api.ts`) + `server-api.ts`.

**П3. Типы DTO — вручную, 611 `interface`/`type`; сверка есть только для заказа.** В админке 186 уникальных путей `/api/…`, в сайте 74, в Mini App 53; типы
написаны руками и лежат кучей: `frontend-admin/lib/api.ts` (1 392 строки, **98 экспортов**: каталог, 2FA, команда, переводы, промокоды, аудит…) + `api-extra.ts` +
`orders-api.ts` + ещё 40 файлов. `scripts/check-dto-drift.mjs` покрывает 8 типов заказа (по golden-JSON), остальное — на честном слове. При этом в бэкенде **уже есть
springdoc** (`/v3/api-docs`, 69 контроллеров) — но не используется.

**П4. Структура папок: «по типу», а не «по фиче».** Админка: фича «Заказы» размазана по `app/orders/[id]/`, `components/orders/` (37 файлов), `lib/orders.ts`,
`lib/orders-api.ts`, `lib/orders-period.ts`, `lib/online-payment.ts`, `components/metrics/…` и `lib/api.ts`. Исключение — `components/metrics/` (там есть свой `api.ts`),
оно же единственное читается целиком. Страницы-god-экраны: `app/admins` 1 083 строк (15 компонентов в одном файле), `app/products` 900, `app/broadcasts` 721,
`app/users` 692, `app/categories` 669. Межфичевые импорты никто не проверяет (`components/orders` → `cards`, `translations`, `catalog`: 13/16/10 раз).

**П5. Лимиты есть, но долг в них — 171 исключение.** ESLint `complexity` 15 / `max-lines` 400 / `max-depth` 4 включены как **error**, но 171 пара «файл — правило» стоит в
`eslint.legacy-limits.mjs` (admin: 76 + 36, site: 24 + 6, Mini App: 22 + 7) — там это warn. Плюс 27 `eslint-disable` (26 — `react-hooks/exhaustive-deps`, то есть
скрытые баги эффектов; всего 310 `useEffect`). **`shared/src` (6 094 строки) не линтится вообще** (у пакета нет скриптов, `eslint .` бежит только внутри приложений).
Корневые `npm run lint` и `typecheck` **пропускают `site`** (для него отдельная джоба CI).

**П6. Нет юнит-тестов вообще.** 0 файлов `*.test.*`/`*.spec.*` в `frontend`, `frontend-admin`, `site`, `shared`; нет vitest/jest. Админку держат 38 e2e-спек (Playwright,
3 764 строки), **покупательские приложения в CI не проверяются ничем, кроме сборки, линтера и `check-browser-compat`** (смоук-тесты — скилл `shop-smoke`, вручную).
Чистая логика (деньги, корзина, лимиты, подарок/кейс, сравнение, доплаты, проверка карточек `card-check.ts` 868 строк) лежит без тестов.

**П7. Деньги, даты, часовой пояс — не «одним способом».**
- Часовой пояс Киева: пинится только на сайте (`site/lib/format.ts`) и в 5 местах админки; **Mini App форматирует даты в поясе телефона**
  (`frontend/lib/format.ts` без `timeZone`); в админке 42 вызова `toLocale…` без `timeZone`.
- `new Date(` 49 мест, `Date.now` 46 — «сейчас» не подменить в тесте.
- Деньги: `money()` есть, но в админке `/ 100` — 30 мест и `toFixed` — 9, на сайте `/ 100` — 5; округление должно совпадать с бэкендом (`OrderMoney`/`MoneyFormat`).
- Модалки/подтверждения: в админке `Modal` — 84 места, `<ConfirmModal` — 1, `window.confirm` — 4; тосты: свой `useToast` в админке (80), свой `Toast` в Mini App
  и на сайте (три разные реализации).

**П8. i18n покупателя типизирован наполовину.** Сайт: `t(key: MessageKey)` — опечатка в ключе не соберётся. Mini App: `t: (key: string)` — любая строка. Сверки ключей
между `uk/ru/en` в CI нет (`uk.ts` объявлен как `RuDictionary` — это ловит только отсутствие ключа, но не лишний/пустой/потерянный `{плейсхолдер}`). Хардкод кириллицы в
коде покупательских приложений небольшой (Mini App 13 строк в 7 файлах, сайт 71 в 8 файлах — в основном юридические тексты и фиды), его не охраняет ничего. Админка русская
намеренно: 4 736 строк кириллицы в 178 файлах — это решение, не долг.

**Что уже хорошо (трогать не надо, а закрепить).** Один `HttpClient` в `shared/src/http.ts` с `ApiError{status, code}`; `lib/*-api.ts` — единственное место путей
(страницы почти не зовут `apiGet/apiPost`: 3 вызова); `transpilePackages` без шага сборки `shared`; нет `any`/`@ts-ignore` (2 `: any` на сайте); `components → app` импортов 0;
`check-browser-compat.mjs` смотрит собранные чанки; `CHUNK_RECOVERY_SCRIPT` и no-cache HTML; `check-dto-drift` и golden-подход; ESLint-лимиты уже в CI.

---

## 2. Целевая архитектура

### 2.1. Принципы (те же, что у бэкенда)

1. **Папки по смыслу фичи, а не по типу файла.** Фичи фронта называются **как модули бэкенда** (`order`, `returns`, `payment`, `catalog`, `promo`, `gift`…) — чтобы
   изменение в модуле бэкенда находило свой фронт за одну минуту.
2. **Слои внутри фичи**: `api → queries → model → ui`. Зависимости только вниз; страница Next — тонкая оболочка.
3. **Одна задача — один способ** (раздел 2.5), каждый способ охраняется правилом, а не договорённостью.
4. **Не строим фреймворк.** Никаких собственных стейт-менеджеров, DI-контейнеров, «слоёв абстракции над fetch». Берём то, что уже стоит (Next 15, React 19,
   react-query 5, zustand, Tailwind 4, framer-motion), и убираем разнобой.
5. **Интерфейс с одной реализацией — только для границы с платформой** (Telegram WebApp vs обычный браузер — см. 2.3), как «порты» бэкенда.

### 2.2. Состав пакетов (workspaces)

```
shared/         →  делится на три пакета (имена папок приложений НЕ меняем — см. решение Р1):
  packages/core      @shop/core      чистый TS, без React и DOM-зависимостей: money, time (Киев), http/ApiError/ErrorCode, locale-ядро,
                                     телефон, URL картинок, ws-клиент, типы из OpenAPI, правила домена без UI (orders, cart, giftcase, compare, catalog)
  packages/ui        @shop/ui        React-примитивы на токенах CSS: Button, Input, Stars, QtyStepper, RadioCard, StatusChip, Toaster+toast, Modal/Sheet,
                                     useConfirm; без знания о бэкенде. Общие для Mini App и сайта; админка подключается на шаге 2 (см. вопрос ниже — её
                                     дизайн «десктоп-плотный», поэтому набор примитивов админки остаётся отдельной папкой внутри `frontend-admin/shared/ui`
                                     до тех пор, пока токены не совпадут)
  packages/customer  @shop/customer  всё покупательское, что одинаково в Mini App и на сайте: фичи cart, catalog, checkout, order, chat, review, compare, gift,
                                     preorder, support (api + keys + queries + model + общий UI там, где совпадение ≥ 90 %), словарь общих ключей i18n,
                                     интерфейс Platform (2.3)
frontend/       Mini App   — оболочка: Telegram-платформа, табы, маршруты, свои экраны
site/           Сайт       — оболочка: cookie-сессия, SSR/ISR, SEO, фиды, свои экраны
frontend-admin/ Админка    — оболочка + свои фичи (покупатель в админке не участвует)
e2e/            Playwright — админка (есть) + смоук покупателя (новое, шаг 5.0)
```

Почему так, а не «один пакет `shared`»: `shared` сейчас — свалка («деньги + анимация кейса + ws + типы»), и в нём нельзя написать правило зависимостей. Три пакета с
явным направлением `ui → core`, `customer → ui, core`, приложения → всё; `core` не знает React (правило ESLint + dependency-cruiser).
Потребление остаётся «TS-исходники через `transpilePackages`, без сборки» — как сейчас (и как защита от разных версий в приложениях).

### 2.3. Платформа покупателя: что отличает Mini App от сайта

Различий по смыслу пять — их и прячем за **одним интерфейсом `Platform`** в `@shop/customer` (реализации: `telegramPlatform` в Mini App, `webPlatform` на сайте):

| Что | Mini App | Сайт |
|---|---|---|
| Токен/сессия | initData → токен в памяти | HttpOnly-cookie (`credentials: include`) |
| Открыть внешнюю ссылку / оплату | `openLink` + возврат | редирект/окно |
| Кнопка «Назад», safe-area, хаптика | Telegram API | `history`, CSS |
| Отправка событий, закрытие | `sendBeacon`/Telegram | `sendBeacon` |
| Рендер | только клиент (75 из 87 файлов `use client`) | RSC + ISR (`server-api.ts`, теги кэша, `/_site/revalidate`) |

Всё остальное — домен: корзина, оформление, заказы, чат, отзывы, сравнение, подарок — одно. Фича в `@shop/customer` получает `Platform` из провайдера и не знает,
где запущена. Экраны (вёрстка) остаются в приложениях; в пакет переезжают те компоненты, которые сегодня совпадают (кандидаты: `PromoField`, `MessageBubble`,
`StatusTimeline`, `BonusOffer`, `PaymentBadge`, `ProductReviews`, `ReviewForm`, `NpCombobox`, `CartGiftProgress`, `OrderGiftCase`, `ProductGiftBanner`).
Слияние самих приложений в одно — вопрос В1, не часть плана по умолчанию.

### 2.4. Структура фичи и приложения

```
<приложение>/
  app/                        только маршруты Next: page.tsx ≤ 60 строк — достаёт параметры и рисует <XxxScreen/> из фичи. Бизнес-логики нет.
  features/<фича>/            (в админке — по модулям бэкенда; в Mini App/сайте — только собственные, остальное в @shop/customer)
    api.ts                    ЕДИНСТВЕННОЕ место с путями `/api/...` этой фичи; возвращает типы из @shop/core/api (сгенерированные)
    keys.ts                   фабрика ключей кэша: orderKeys.list(filter), orderKeys.detail(id) — литералы `queryKey: [` вне keys.ts запрещены
    queries.ts                useXxxQuery / useXxxMutation (react-query); инвалидация и оптимистичные правки — только здесь
    model/                    чистая логика, форматтеры, валидаторы, селекторы; без React там, где можно; юнит-тесты рядом (*.test.ts)
    ui/                       компоненты фичи; <Фича>Screen.tsx — экран; файл ≤ 400 строк
    store.ts                  (редко) zustand-стор клиентского состояния фичи
    index.ts                  публичный API фичи: наружу только экран, хуки и типы
  shell/                      провайдеры, Shell/TabBar/Header, роутинг-конфиг навигации, realtime.ts
  lib/                        только то, что не принадлежит фиче и не нужно в core (например, PWA-регистрация админки)
```

Админка по бэкенд-модулям (≈ 18 фич вместо 136 компонентов вперемешку): `order` (доска, таблица, карточка, чат, оплата, правки, слияние),
`returns` (возврат/обмен/частичный выкуп), `payment`, `catalog` (товары, категории, бренды, характеристики), `translation`, `cards` («Карточки» ИИ),
`inventory` (списания), `procurement` (поставки/предзаказы/себестоимость, «Открытие кассы»), `promo`, `gift`, `review`, `support`, `customer` (пользователи, карта),
`notification` (рассылки, push), `analytics` + `finance` (метрики), `inbox` («Внимание», «Отправка»), `staff` (админы, 2FA, приглашения, инциденты, аудит),
`site` (настройки сайта/ревалидация), `settings`.

Правила зависимостей (проверяет **dependency-cruiser**, 2.7):
- `app → features → (@shop/customer | @shop/ui) → @shop/core`; приложение не импортирует чужое приложение; `core` не импортирует React/DOM/Next.
- Внутри фичи: `ui → queries → api`, `ui → model`, `queries → keys`; **`api` и `model` не знают React** (кроме `queries.ts`/`ui/`).
- Фича зависит от другой фичи **только через её `index.ts`**; циклов между фичами нет. Направление фич — как у модулей бэкенда
  (`finance, analytics, inbox → review, support, gift → returns, payment → order → …`).
- В `app/` нельзя импортировать `features/*/ui|api|model` напрямую — только `index.ts`.

### 2.5. Единые способы («одна задача — один способ»)

| Задача | Единый способ | Чем проверяется |
|---|---|---|
| Запрос к API | `HttpClient` из `@shop/core/http`; пути только в `features/*/api.ts`; прямой `fetch(` запрещён (исключения-обёртки внутри core: `http.download`, `http.beacon` для logout/analytics `keepalive`) | ESLint `no-restricted-globals: fetch` вне `core/http` и `server-api` |
| Кэш и данные сервера | react-query; `useEffect` + загрузка руками запрещены; настройки по умолчанию из **пресетов** `QUERY_PRESETS.{live, list, static}` (вместо 83 литералов `staleTime`); один `makeQueryClient()` на все приложения | ESLint-правило на `staleTime:`/`refetchInterval:` литералы вне пресетов |
| Ключи кэша | фабрика в `keys.ts` фичи; литерал `queryKey: ["…"` вне `keys.ts` — ошибка; `useQueryClient` разрешён только в `queries.ts` и `shell/realtime.ts` | ESLint `no-restricted-syntax` + dependency-cruiser |
| Запись / мутация | `useApiMutation` из `@shop/ui` (одна обёртка: блокировка кнопки, ошибка → единый `toast`, `invalidate` из конфигурации, идемпотентный ключ для оплат, опционально оптимистичное обновление с откатом); ручной `try/catch` вокруг `api.*` в компонентах — нет | ESLint: `catch` в `ui/` без `reportError` не проходит (кастомное правило на `no-restricted-syntax` по `TryStatement` в `features/**/ui`) |
| Realtime | один `shell/realtime.ts` на приложение: сообщение STOMP → `invalidate(keys…)`; опрос — только пресет `live` | dependency-cruiser: `ws` импортируется только из `realtime.ts` |
| Ошибки | `ApiError{status, code, params}`; `code` — **тот же `ErrorCode`, что на бэкенде** (`DomainException`); одна функция `errorMessage(e, t?)`: покупателю — по коду через i18n `error.<CODE>`, админу — русский текст сервера; `e.message` в компонентах не читают | ESLint: `no-restricted-syntax` на `.message` у `catch (e)` в `features/**/ui`; проверка `check-error-codes.mjs` (все коды из golden бэкенда есть в TS и в словарях) |
| Клиентское состояние | локальное — `useState`; общее между экранами и не с сервера — **zustand-стор в `features/*/store.ts`** (корзина, предпочтения); `createContext` — только для провайдеров платформы; `localStorage/sessionStorage` — только через `core/storage` (try/catch, префикс ключа) | ESLint `no-restricted-globals` на `localStorage`/`sessionStorage` вне `core/storage` (сейчас 62 прямых `localStorage` + 16 `sessionStorage`) |
| Формы | `react-hook-form` + **чистые валидаторы в `model/validate.ts`** (без zod: схема валидации бэкенда — источник правды, вторая схема = ещё один дрифт); сообщения валидации — коды, текст по коду | ревью + правило: `<form` вне `useForm` в `features/**/ui` — предупреждение с храповиком |
| Деньги | `long` minor; показ — `money()` из `@shop/core/money`, ввод — `toMinor/toMajor`; `/ 100`, `* 100`, `toFixed` для денег запрещены | ESLint `no-restricted-syntax` на `BinaryExpression[right.value=100]` в `features/**`, `app/**` (после миграции — error) |
| Дата, время, часовой пояс | `@shop/core/time`: **показ — в поясе того, кто смотрит** (браузер/телефон: покупатели из Европы и др., решение В4); `formatDate/Time/DateTime(iso, tag)` без зашитого пояса, `now()` (подменяется в тестах). Границы бизнес-периодов (дни отчётов, сроки) считает бэкенд по Киеву — фронт их не пересчитывает. На сайте даты рендерятся на клиенте (`<LocalTime iso>` после гидрации, на сервере — нейтральный плейсхолдер), чтобы не получить React #418; `new Date()` без аргумента, `Date.now`, `toLocale*`, `Intl.DateTimeFormat` вне `core/time` и `core/format` запрещены | ESLint `no-restricted-syntax` / `no-restricted-properties` |
| i18n покупателя | один набор общих ключей в `@shop/customer/i18n` + словари приложений; `t(key: MessageKey)` типизирован **везде** (Mini App тоже); паритет `uk/ru/en` (ключи, `{плейсхолдеры}`, пустые значения) проверяет `scripts/check-i18n.mjs`; хардкод кириллицы в `.ts/.tsx` покупательских приложений вне словарей/юр. текстов — ошибка | `check-i18n.mjs` + ESLint `no-restricted-syntax` на `Literal[value=/[А-Яа-яЄєІіЇї]/]` |
| i18n админки | русский прямо в разметке (решение владельца, сохраняется); подписи enum/статусов — в `features/<фича>/model/labels.ts`, а не в JSX | ревью |
| Тосты | один `toast.success/error/info` из `@shop/ui`; свои реализации (`useToast` админки, `Toast` Mini App/сайта) удаляются | dependency-cruiser: запрет импорта старых путей |
| Модалки и подтверждения | `<Modal>`/`<Sheet>`/`<Drawer>` из `@shop/ui`, подтверждение — `useConfirm()` (промис); `window.confirm/alert` запрещены; стек оверлеев и «назад закрывает» — внутри `Modal` (сейчас `overlay-stack.ts`, `use-back-close.ts`) | ESLint `no-restricted-globals: confirm, alert` |
| Стили | Tailwind 4 + CSS-токены; `style={{…}}` — только для вычисляемых значений (сейчас 299 вхождений: ratchet вниз, не обязательство ноль) | ratchet-счётчик |
| Размер | файл ≤ 400 строк кода (без пустых и комментариев), **без списка исключений в конце**; функция-компонент ≤ 200 строк; `page.tsx` ≤ 60; `complexity` 15; `max-depth` 4; `react-hooks/exhaustive-deps` — **error** (26 отключений → 0) | ESLint (уже есть + новые) |
| Типы DTO | **генерация из OpenAPI бэкенда** (2.6); ручные `interface` для ответа API запрещены, view-модели — в `model/` | `gen:api` + `git diff --exit-code` в CI |
| Тесты | `model/` и `core` — vitest, быстрые юниты; запросы — тесты `queries` с фейковым `HttpClient` (MSW не нужен); админка — Playwright e2e; покупатель — смоук Playwright WebKit | CI |

### 2.6. Типы DTO: генерация из OpenAPI

Сейчас: руками 611 типов + `check-dto-drift` на заказе. Цель: типы **генерируются** из того, что реально отдаёт бэкенд.

1. Бэкенд: тест (по образцу golden) снимает `/v3/api-docs` на поднятом контексте и сверяет с `backend/src/test/resources/openapi/openapi.json`; расхождение валит тест,
   обновление — флагом `-Dopenapi.update=true`, как `-Dgolden.update`.
2. Фронт: `openapi-typescript` (только типы, **ноль рантайма** — в бандл ничего не попадает) генерирует `packages/core/src/api/generated.d.ts`
   (коммитится). CI: `npm run gen:api && git diff --exit-code`.
3. `features/*/api.ts` аннотируют ответы `components["schemas"]["…"]`; ручные дубликаты удаляются по мере переезда фичи.
4. Коды ошибок: golden `error-codes.json` (тест бэкенда) → `check-error-codes.mjs`.
5. `check-dto-drift.mjs` остаётся, пока не переехал `order`; потом удаляется вместе с исключениями.

**Риск (проверить на пилоте шага 3):** springdoc по умолчанию не отличает `null`-able поля Java-records и считает поля необязательными, если нет `@NotNull`/`@Schema(requiredMode)`;
типы получатся «слишком мягкими» (`field?: T`) и фронт перестанет ловить пропавшее поле. Пилот на `order` + `catalog` с настройкой
`springdoc.default-flat-param-object` / `OpenApiCustomizer` (все не-nullable record-компоненты — required). Если пилот не сходится за 2 сессии — **откат на план Б**: расширить
`check-dto-drift` golden-образцами на `catalog`, `cart`, `payment`, `gift` (дешевле, но покрытие = образцы).

### 2.7. Проверки в CI (только то, что реально работает в нашем стеке)

Принцип бэкенда сохраняется: **нарушений нет, новое запрещено; число — объём работы; цель ноль.** Две механики:

1. **dependency-cruiser** (один инструмент вместо eslint-plugin-boundaries + import/no-cycle): `.dependency-cruiser.cjs` в корне, правила слоёв и циклов (2.4);
   поддерживает workspaces и `baseline` (`--output-type baseline` → `known-violations.json`, `--ignore-known`). Скрипт `check-arch-front.mjs`:
   запускает depcruise, и если число «известных» нарушений **выросло** относительно закоммиченного `known-violations.json` — падает; «понизить baseline» — отдельной командой, как у бэкенда.
2. **ESLint + храповик**: новые правила (ключи, деньги, время, `fetch`, `localStorage`, `confirm`, кириллица, `exhaustive-deps`, размер) включаются сначала как **warn**;
   `scripts/check-front-ratchet.mjs` запускает `eslint -f json` по трём приложениям + `shared`, считает предупреждения по правилам и фичам, сравнивает с
   `frontend-baseline.txt` (`<правило> <приложение> <число>`), **рост = падение, снижение = подсказка понизить**. Когда по правилу ноль — оно переключается в **error**, строка из baseline исчезает.
   В конце плана `eslint.legacy-limits.mjs` (171 запись) и baseline удалены; остаётся чистый `eslint .` без warn.
3. Сводка по образцу `architecture-v2-summary.txt`: таблица «приложение × правило», `migrated features: N of M`, печатается в каждом прогоне.
4. `scripts/check-invariants.mjs` (быстрый, без сборки) — защита от «не убирать»: оба корневых layout содержат `CHUNK_RECOVERY_SCRIPT` первым в `<head>`;
   в `infra/gateway*.conf` есть `Cache-Control: no-cache` для HTML; нет lookbehind-литералов `(?<=`, `(?<!` ни в `.ts/.tsx`, ни в `new RegExp("…")` (ESLint `no-restricted-syntax`
   по `Literal[regex.pattern=/\(\?<[=!]/]` + то же для строк); `core` не импортирует `react`.
5. `check-i18n.mjs`, `check-error-codes.mjs`, `gen:api`-diff — как в 2.5/2.6.
6. **Единый вход:** `npm run lint`, `typecheck`, `test`, `arch:front` в корне запускают **все** workspaces, включая `site` и `shared` (сейчас `site` и `shared` из корня не проверяются);
   в CI джобы `frontends` и `site` объединяются в матрицу по приложениям с общим `npm ci`-кэшем.
7. Бюджет бандла: после `next build` скрипт читает размеры чанков маршрутов Mini App и сайта (First Load JS из `.next`), сравнивает с `bundle-baseline.txt`; рост > 3 % по
   маршруту — падение (защита iOS-производительности, где уже была чистка тормозов).

Чего **не** берём: `eslint-plugin-compat` (шум и ложные срабатывания, его заменяет `check-browser-compat.mjs` по собранному коду), `knip`/`ts-prune` как блокирующий шаг (только отчёт
в шаге 8), Storybook, Redux/XState, zod, GraphQL/tRPC, микрофронтенды.

### 2.8. Как не сломать совместимость браузеров

- Все новые пакеты потребляются как TS-исходники и собираются тем же SWC с тем же `browserslist` (iOS 15.4+/Chrome 92+); `check-browser-compat.mjs` смотрит **собранные чанки** —
  автоматически покрывает `@shop/core|ui|customer`, `react-hook-form` и любую новую библиотеку. Скрипт добавляется в CI **для обоих покупательских приложений на каждом шаге**, а не только по релизу.
- Новые зависимости: `react-hook-form` (~9 КБ gzip), `openapi-typescript` (только dev, типы), `vitest` (dev), `dependency-cruiser` (dev). Каждая — до шага проверяется на предмет lookbehind/`structuredClone`-подобных
  API через тот же скрипт; `react-hook-form` в Mini App подгружается только в чанках оформления/отзыва/поддержки.
- Правила `BROWSER-SUPPORT.md` переходят в линтер (lookbehind, `toSorted/toReversed`, `Object.groupBy`, `Promise.withResolvers`, `static {}` — `no-restricted-properties`/`syntax`),
  а не только в документ.
- «Ничего умного на верхнем уровне модулей» — правило для `core`/`ui`/`customer`: регулярки и тяжёлые вычисления лениво (ESLint `no-restricted-syntax` на `Literal[regex]` на верхнем уровне
  модуля `packages/**` — с белым списком безопасных).
- `CHUNK_RECOVERY_SCRIPT` и no-cache HTML — перечислены в `check-invariants.mjs` (2.7.4). Переезд layout-файлов не должен менять порядок `<head>`.
- Проверка глазами — `shop-ui-qa` (7 ширин × 3 языка, WebKit iPhone) **после каждого шага 5–7**, плюс реальный старый iPhone/эмулятор iOS 15 для чанков из новых пакетов, если доступен.

### 2.9. Что НЕ меняется (рамки)

Next 15 + React 19 + Tailwind 4 + framer-motion + react-query + zustand; `output: "standalone"`, rewrites/ISR/теги кэша сайта; домены, пути URL, SEO-разметка, фиды, middleware локалей;
контракты API (бэкенд не трогаем, кроме тестов-снимков OpenAPI/кодов ошибок); внешний вид и тексты (визуальные дифы = баги); имена папок приложений `frontend/`, `frontend-admin/`, `site/`.

**Решение Р1 (без вопроса): папки приложений не переименовываем.** `frontend` → `miniapp` ломает 4 Dockerfile'а, CI, `publish.yml`, скиллы `shop-*`, память сессий, пути в документах
и ничего не даёт; в README вводим таблицу «имя папки → что это».

---

## 3. План переезда

**9 шагов (0–8), 18 веток.** Шаг = ветка от `arch/v2` (`arch/front-step-N-<имя>`), все проверки CI зелёные, храповик не вырос, в `arch/v2` — после CI и демо-проверки. Прод — по решению В5.
Порядок: сначала то, что **измеряет и защищает** (0), потом общий фундамент без смены вида (1–3), потом **админка** (есть e2e → безопасно отработать шаблон), потом
**покупательские** приложения (нет тестов → сначала страхуем, потом двигаем). Размер: S ≈ 1 сессия, M ≈ 2–3, L ≈ 4–6.

| Шаг | Что делаем | Размер | Поведение меняется? |
|---|---|---|---|
| **0. Измерение и страховка** | `dependency-cruiser` + `known-violations.json`; `check-front-ratchet.mjs` + `frontend-baseline.txt`; новые ESLint-правила как warn; `check-invariants.mjs`; vitest в workspaces; `shared/src` под линтер; корневые `lint/typecheck/test` покрывают `site` и `shared`; сводка «приложение × правило»; бандл-baseline; Dockerfile'ы готовятся к новым workspace-пакетам (`COPY packages/*/package.json`) | M | нет |
| **1. `@shop/core`** | Разрезать `shared` на `core / ui / customer` (пока кладём в `core` и `ui`, `customer` пустой); `core/time` (пояс пользователя, `now()`), `core/storage`, `core/errors` (`ApiError{code,params}`, `errorMessage`), `core/query` (пресеты, `makeQueryClient`); заменить 49 `new Date`, 46 `Date.now`, 42 `toLocale*` без пояса, 62 прямых `localStorage`; vitest: money, time, format, orders, cart, compare, giftcase | L | **Да, одно:** сайт и админка показывают время в поясе пользователя, как Mini App (В4), отдельным коммитом |
| **2. `@shop/ui` и платформа UI** | Единые `toast`, `Modal/Sheet/Drawer`, `useConfirm`, `useApiMutation`; `useForm`-обвязка; заменить 4 `window.confirm`, три реализации Toast, самодельные оверлеи; примитивы Button/Input/QtyStepper/RadioCard/StatusChip переезжают из дубликатов `frontend`/`site` (визуально идентичны — это проверяется скриншотами) | L | нет |
| **3. Типы из OpenAPI** | Пилот `order` + `catalog` (настройка springdoc, снимок, `gen:api`, CI); затем остальные модули; `error-codes.json`; для админки и покупателя ручные DTO заменяются на сгенерированные волнами (вместе с фичами в шагах 4–7) | M (пилот) → дальше внутри 4–7 | нет |
| **4. Админка (6 веток)** | см. ниже | L×6 | нет |
| **5. `@shop/customer` (6 веток)** | см. ниже | L×6 | нет |
| **6. Mini App** | `features/` по фичам, разбор god-экранов: `checkout/page.tsx` 1 207 → экран ≤ 60 строк + `features/checkout`; `orders/[id]/page.tsx` 872; `page.tsx` 692; `FilterSheet` 469; `CompareSheet` 525; `telegram.ts` 572 → `platform/telegram/*`; `TabBar`; `t(key: MessageKey)` | L | нет |
| **7. Сайт** | то же + граница RSC: `features/*/server.ts` (то, что сегодня в `server-api.ts`, `feeds.ts`, `seo.ts`), `CatalogFilters` 943, `CheckoutView` 771, `site/lib` 30 файлов → фичи; ISR/теги/rewrites не трогаем | L | нет |
| **8. Финиш** | `eslint.legacy-limits.mjs` ×3 удалены, baseline пуст, все правила — error; `check-dto-drift` удалён; `knip`-отчёт; документы (`ARCHITECTURE-FRONT.md`, обновить `ARCHITECTURE-CHECKS.md`, `CLAUDE.md` репо, скиллы `shop-ui-qa`, `shop-i18n-keys`, `shop-admin-api`); статус в память | M | нет |

**Шаг 4. Админка** (порядок — от простого и покрытого e2e к большому; после каждой ветки — `npm run e2e` целиком + ручной обход на десктопе и телефоне):
- 4a: каркас `features/`, `shell/` (разрезать `Shell.tsx` 1 125: навигация-конфиг / сайдбар / нижний tab-bar / бейджи), `staff` (`admins/page.tsx` 1 083, 2FA, приглашения, `account`, `audit`, `incidents`), `settings`, `site`. e2e: 01, 13, 15, 17–19, 33, 36.
- 4b: `order` + `returns` + `payment` (самый тяжёлый домен: `OrderDrawer` 871, `ReturnModal` 948, `OrderDetails` 743, доска, `lib/orders*.ts`, `online-payment.ts`). e2e: 04–09, 21, 37.
- 4c: `catalog` + `translation` + `cards` (`ProductModal` 1 404, `AttributeDialog` 847, `CategoryDialog` 705, `ReviewPanel` 984, `AiTranslate` 726, `card-check.ts` 868, `translation-check.ts` 584). e2e: 10, 20, 22–24, 32.
- 4d: `promo`, `gift` (`CasePanel` 704, `case-draft`), `review`, `support`, `customer`, `notification` (рассылки, push). e2e: 25–28, 30.
- 4e: `procurement` + `inventory` + `analytics/finance` (предзаказы, себестоимость, списания, метрики). e2e: 14, 29, 35, 38.
- 4f: `inbox` («Внимание»), `dispatch` («Отправка»), остаток `lib/api.ts` → 0 (файл удалён), `lib/` почищен, `api-extra.ts` удалён; ratchet по админке = 0.

**Шаг 5. `@shop/customer`** (в каждой ветке: код фичи переезжает в пакет, **оба** приложения переключаются на него, дубликат в `frontend/` и `site/` удаляется; перед и после — смоук 5.0 и `shop-ui-qa`):
- **5.0 Страховка (до переноса):** смоук-спеки Playwright в `e2e/` для покупателя (WebKit, профиль iPhone + десктоп): каталог → товар → корзина (промокод) → оформление до старта оплаты (тестовый режим monobank/заглушка) → страница заказа → чат → отзыв → сравнение → подарок/кейс. Это характеризующие тесты в смысле Feathers: **фиксируют текущее поведение**, не желаемое. Бегут в CI на изолированном стеке, как e2e админки.
- 5a: `Platform` + `cart` (`cart.ts`, `cart-sync.ts` — разошлись 226/265) + `catalog` (фильтры, карточка, `catalog.ts` 103/204).
- 5b: `checkout` + `payment` + `delivery` (НП: `NpCombobox`, `NpWarehouseMap` 432/326; `PromoField`; `order-limits`).
- 5c: `order` (страница заказа, `StatusTimeline`, доплата, чек) + `chat` + `support`.
- 5d: `review` + `compare` + `gift` (`OrderGiftCase` 350/326, `CartGiftProgress`, `ProductGiftBanner`; `shared/src/ui/GiftCaseOpening.tsx` 793 разбирается) + `preorder`.
- 5e: i18n: общий словарь (338 общих ключей, 291 с одинаковым текстом → одна копия), `t(MessageKey)` в Mini App, `check-i18n.mjs` в CI, `analytics.ts` (214/202 → одна реализация).

Ожидание (не обещание): из ~4,8 тыс. + 4,8 тыс. дублированных строк в `@shop/customer` останется около половины — вёрстка, которая действительно разная, остаётся в приложениях.

**Храповик по шагам.** На каждом шаге в PR показывается таблица «до → после» (по образцу сводки бэкенда): число `legacy`-записей ESLint, число нарушений depcruise, число
литералов `queryKey`, `catch`, `toLocale*`, файлов > 400, размер бандла по маршрутам. Строки таблицы могут только падать. Осознанный рост (правило стало измеримым) — только
с флагом `--allow-growth=<правила>` и причиной в сообщении коммита.

### 3.1. Риски и защита

| Риск | Что делаем |
|---|---|
| Покупательские приложения без тестов — рефакторинг вслепую | Шаг 5.0 до любого переноса; перенос по одной фиче; каждый шаг сначала на демо-стенде (`shop-demo`) |
| iOS 15.4–16.3: новая библиотека/регулярка роняет чанк (как 25.10) | `check-browser-compat` на каждом шаге для обоих покупательских приложений; правила в линтере; новые зависимости — по одной |
| Рост бандла из-за общего пакета (барель-импорты, «всё в одном index») | Явные подпути `@shop/customer/<фича>`; `sideEffects: false`; бюджет бандла +3 % |
| Сайт/админка: время «Киев» → пояс пользователя; SSR даёт расхождение гидрации | Единственное намеренное изменение поведения (В4), **отдельный коммит** шага 1; на сайте даты только клиентские (`LocalTime`), проверка консоли на #418 |
| OpenAPI-типы «слишком мягкие» | Пилот шага 3 с критерием выхода; план Б (расширить golden/drift) |
| Админка: e2e 38 спек покрывают не всё (метрики значения, предзаказы, поддержка — частично) | В каждой ветке шага 4 дописываются спеки на то, что двигается без покрытия (по списку веток выше); ручной обход |
| Гидратация/RSC на сайте (React #418 уже был) | В шаге 7 `server.ts` и клиентские границы не смешиваем; `HydrationGate` остаётся; смотреть консоль в `shop-ui-qa` |
| Конфликты с параллельными ветками (Хеллоуин, НП, предзаказы) | Каждый шаг короткий; правки фичи в чужой ветке портируются вручную; на время шага фича «замораживается» в `TODO`; НП/Хеллоуин в план не входят |
| Dockerfile'ы/CI: новые workspace-пакеты не попадают в контекст сборки | Подготовка в шаге 0; сборка всех образов (`publish.yml` dry-run) в CI на каждом шаге |
| «Архитектура ради архитектуры» | Паттерн вводится, только если он убирает измеримое (таблица в 3): `Platform` — единственный интерфейс с одной-двумя реализациями и только на границе платформы |

### 3.2. Что проверять (на каждом шаге)

1. `npm run lint && npm run typecheck && npm run test && npm run arch:front` (все workspaces) — зелёные, храповик не вырос.
2. `npm run build` всех приложений + `check-browser-compat.mjs frontend site` + бандл-бюджет.
3. **Админка:** `npm run e2e` целиком (38 спек, после шага 4 — больше) + ручной обход затронутых разделов на десктопе и телефоне (мобильные спеки 03, 05, 18 есть).
4. **Mini App и сайт (шаги 5–7 и всегда, если тронут покупательский код):** `shop-ui-qa` — **7 ширин (320 … 1440) × 3 языка (uk/ru/en)**, WebKit-профиль iPhone, скрипт на
   боковой скролл, вылезания, наложения, переносы; без плавающих кнопок над сеткой; смоук 5.0; сверка скриншотов «до/после» (визуальный дифф должен быть пуст, кроме намеренных мест).
5. Демо-стенд (`shop-demo`) с данными прода: вход в Mini App через `?tgstub=`, оплата тестовым токеном monobank, чат, отзыв, сравнение, подарок.
6. После релиза на прод — `shop-smoke` + `shop-seo-check` (метаданные, hreflang, фиды, ISR, редиректы `/uk` → без префикса).
7. Журнал ошибок фронта (`client_events`/«Бот и сайт») за сутки после выкатки — нет новых типов (особенно `e[n].call`, #418, SyntaxError на старых iOS).

---

## 4. Решения владельца (30.10.2026)

- **В1:** НЕ объединять приложения, общий пакет `@shop/customer` — да.
- **В2:** типы генерировать из OpenAPI.
- **В3:** `react-hook-form` + чистые валидаторы — да.
- **В4:** НЕ Киев. Время показывается **относительно пользователя** (пояс браузера/телефона); бизнес-границы периодов — Киев на бэкенде.
- **В5:** три релиза на прод (после админки, после Mini App, после сайта).
- Переделка полная, не частичная.

### Исходные вопросы (для истории)

**В1. Объединять ли Mini App и сайт в одно покупательское приложение?** Сейчас два деплоя с 4,8 тыс. строк дублей; можно сделать один Next-проект с двумя «оболочками».
*Рекомендация: нет. Сделать общий пакет `@shop/customer` (шаг 5) и два деплоя как сейчас* — у них разный рендер (клиент против RSC/ISR), разные политики кэша, SEO и безопасности (frame-ancestors, cookie против токена),
и каждый слитый вопрос — риск для SEO сайта. Вернёмся к вопросу после шага 5, когда будет видно, сколько вёрстки реально совпало.

**В2. Генерация типов из OpenAPI (новая зависимость `openapi-typescript`, springdoc уже есть) — согласны?** Альтернатива — расширить текущий `check-dto-drift` на другие модули.
*Рекомендация: да, с пилотом на `order` + `catalog` и критерием «типы не мягче, чем DTO»; не сошлось за 2 сессии — план Б (расширение drift-чека).* Это единственное, что убирает 611 ручных типов, а не только сторожит их.

**В3. Формы: `react-hook-form` + чистые валидаторы (без zod) — согласны?** +9 КБ gzip, только в чанках оформления/отзыва/поддержки у покупателя, в админке — везде, где форма > 3 полей.
*Рекомендация: да.* Альтернатива «ничего не добавлять, свой хук формы» — больше своего кода и снова «у каждого экрана по-своему».

**В4. Можно ли одним осознанным изменением показать даты в Mini App в поясе Киева, как на сайте?** Сейчас — в поясе телефона (человек в отпуске увидит «вчера» вместо «сегодня» у своего заказа).
*Рекомендация: да, отдельным коммитом шага 1, остальное в плане — без изменения поведения.* Заодно админка: все 42 `toLocale…` без пояса получают Киев.

**В5. Как выкатывать: каждый шаг на прод, или копить?**
*Рекомендация: после каждого шага — на демо и в `arch/v2` (не на прод); на прод — тремя релизами: после шага 4 (админка, e2e-страховка), после шагов 5–6 (Mini App) и после 7–8 (сайт).* Покупательские шаги трогают
SEO и оплату — их безопаснее выкатывать крупными, но проверенными кусками, чем накапливать все 9 шагов в одном релизе (откат = `rollback.sh` предыдущего релиза, как и сейчас).

---

## 5. Что дальше

Документ ждёт ответов на В1–В5 (по умолчанию — рекомендации). После утверждения: шаг 0 стартует с ветки `arch/front-step-0-measure` от `arch/v2`, и первым результатом будет сводная
таблица «приложение × правило» с реальными числами нарушений — они и станут baseline. Кода до утверждения не пишем; в репозитории — `docs/ARCHITECTURE-FRONT.md`.
