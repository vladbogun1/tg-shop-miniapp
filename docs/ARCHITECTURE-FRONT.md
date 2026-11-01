# Целевая архитектура фронтов tg-shop-v2 — УТВЕРЖДЕНО 30.10.2026

**Статус: утверждено владельцем 30.10.2026 (решения — раздел 4). Переделка ПОЛНАЯ, не частичная: в конце нет старых паттернов, исключений и baseline.** Основа — ветка `origin/arch/v2` (коммит `0243500a`, бэкенд уже переехал по
`docs/ARCHITECTURE.md`), обмер сделан на этом коммите. Образец формы — архитектура бэкенда: модули по смыслу, слои, «одна задача — один способ»,
проверки в CI с храповиком «только вниз», цель — ноль исключений.

Охват: `frontend/` (Mini App), `frontend-admin/` (админка), `site/` (сайт), `packages/`, `e2e/`. Ограничения, которые нельзя ломать, собраны в разделе 2.9.

---

Аудит «до» (числа на коммите `0243500a`), план переезда по шагам 0–8 и исходные вопросы — в [archive/ARCHITECTURE-FRONT-plan-2026-10.md](archive/ARCHITECTURE-FRONT-plan-2026-10.md).

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
(было shared/)         →  делится на три пакета (имена папок приложений НЕ меняем — см. решение Р1):
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

**Статус шага 3 (пилот order + catalog), ветка `arch/front-step-3-openapi`.** Критерий выхода пройден: типы строгие (у response-схем всё required,
честные nullable и enum'ы; снимок вырос с 41 required / 0 nullable до required у всех полей ответов). Устройство и правила — в
ARCHITECTURE-CHECKS.md («Типы ответов API из OpenAPI»). Переехало: весь `order` (core/types.ts, giftcase, support, `orders-api.ts`, карточка/детали/доска
в админке, `OrderCardDto`/`OrderDetailDto`/`DispatchOrder`) и витринные типы `catalog` (SpecOption, FacetBucket, SpecAttribute, SpecGroup,
CatalogCategory, CatalogBrand, CatalogSchema, ProductBrandRef). **Осталось (шаг 4+, не сходится механически — нужны решения):**
1. `Product`/`ProductImage`/`ProductVariant` и `AdminProduct` — один ручной `Product` сейчас служит и витрине, и админке, и формам; `ProductDto` (null вместо undefined,
   без `archived`, `StorefrontProduct extends Product`) даёт ~50 ошибок; нужно разделить витрину и админку.
2. Админский каталог (`AdminCategory`, `AdminBrand`, `AdminSpecAttribute`, `AdminSpecGroup`…): фронт читает и пишет `sortOrder`, а бэкенд шлёт и принимает `sort`
   (несовпадение, которое типы показали; поведение не менялось) — решить владельцу, чей вариант верный.

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

## 3. Решения владельца (30.10.2026)

- **В1:** НЕ объединять приложения, общий пакет `@shop/customer` — да.
- **В2:** типы генерировать из OpenAPI.
- **В3:** `react-hook-form` + чистые валидаторы — да.
- **В4:** НЕ Киев. Время показывается **относительно пользователя** (пояс браузера/телефона); бизнес-границы периодов — Киев на бэкенде.
- **В5:** три релиза на прод (после админки, после Mini App, после сайта).
- Переделка полная, не частичная.

## 4. Итог (шаг 8, 31.10.2026)

Шаги 0–8 выполнены в `arch/v2` (прод не затронут).

| Шаг | Что стало |
|---|---|
| 0 | depcruise + храповик ESLint + инварианты + бандл-бюджет + vitest |
| 1–2 | `packages/core` (деньги, время, хранилище, ошибки, запросы), `packages/ui` (toast, модалки, `useApiMutation`, примитивы) |
| 3 | Типы DTO из OpenAPI (`packages/core/src/api/generated.d.ts`, `npm run gen:api`), `check-golden-schema` вместо `check-dto-drift` |
| 4 | Админка по `features/` + `shell/`; ручные DTO и `lib/api*.ts` удалены |
| 5 | `packages/customer`: корзина, заказ, чекаут, чат, поддержка, подарок/кейс, общий словарь i18n (257 ключей), аналитика |
| 6 | Mini App: `frontend/features/*`, `frontend/shell`, `frontend/platform/telegram/*` |
| 7 | Сайт: `site/features/*` (`ui`, `model`, `server` с `server-only`), страницы `app/` тонкие |
| 8 | Лимиты — error везде, мёртвый код убран, документы |

Что в конце (числа на HEAD шага 8):
- `eslint.legacy-limits.mjs`: 171 запись (на старте) → **0 файлов**; `complexity` / `max-lines` / `max-depth` / `max-lines-per-function` в baseline — **0**.
- `known-violations.json` (depcruise): 6 → **4**, все — `ws-only-from-realtime`: чат заказа и поддержка подключают WebSocket из своих экранов (Mini App: `OrderChatScreen`, `support/api.ts`; сайт: `OrderChat`, `support/queries.ts`). Перенос подписок в `shell/realtime.ts` меняет момент подключения — оставлено.
- `scripts/frontend-baseline.txt` — **пуст** (только комментарий): все счётные правила на нуле, `npm run arch:front` показывает нули по 18 правилам.
- `scripts/i18n-orphans-baseline.json` удалён: сирота — ошибка `check-i18n`.
- `knip` (разовый отчёт, не в CI): удалены `site/components/ui/Toast.tsx` (+ зависимость `zustand`), пустой barrel `frontend/features/checkout/index.ts`, `frontend-admin/features/order/queries/index.ts`. Остальное (≈160 неиспользуемых экспортов/типов, `server-only` и `eslint-config-next` как «непрописанные/лишние» зависимости) — публичные входы фич и ложные срабатывания.
- `toPercent`: четыре копии в админке → `@shop/core/percent`.
- Баги, найденные по дороге (не чинились): отказ `loadEarlier` в чате заказа Mini App; Enter в промокоде сайта отправляет заказ до применения скидки; «Надіслати відгук» активна до заполнения.
