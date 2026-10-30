# Автоматические проверки архитектуры

**Принцип: нарушений нет, новое запрещено.** Правила из `CLAUDE.md` агенты и люди со временем смягчают,
поэтому строгость держат проверки в CI. Бэкенд: список исключений **пуст** (с шага 8 переезда), любое нарушение валит
`mvn -B -ntp test`. Фронты: список исключений ESLint ещё есть и может только **уменьшаться**.

## Архитектура v2: храповик по модулям (`ArchitectureV2Test`)

Целевая структура — [ARCHITECTURE.md](ARCHITECTURE.md). Правила 2.2 и таблицы раздела 3 написаны для **целевых** пакетов
`com.maxsolch.shop.<модуль>.{api,app,domain,infra}` и `platform` и применяются ко **всему** коду без заморозки по файлам:
вместо списка исключений — число нарушений на каждое правило и модуль.

- Модуль класса: `platform` (весь пакет), `<модуль>` (если класс лежит в `<модуль>.api|app|domain|infra`), иначе **`legacy`** —
  старые `service`, `web`, `domain`, `repository`, `tg`, плоские пакеты `catalog`, `gift`, … Для слоёв `legacy`-класс получает
  «подразумеваемый» слой по имени/аннотациям/старому пакету (контроллер и `web.*` — api, `repository`/`*Store` — infra, `domain`/`@Entity` — domain,
  остальное — app), поэтому сервис, возвращающий web-DTO, считается нарушением «app → api» ещё до переноса.
- Тест считает **различные пары** «класс → деталь» на каждое правило и модуль и сравнивает с
  `backend/src/test/resources/architecture/v2-baseline.txt` (`<правило> <модуль> <число>`, нули не пишутся). **Число выросло — тест падает**
  и показывает первые нарушения. Число уменьшилось — тест проходит и пишет подсказку «baseline можно понизить».
- Правила (id в колонках сводки): L1 api не лезет в infra; L2 app/domain не знают api; L3 domain без web/Jdbc/HTTP/стереотипов Spring;
  L4 infra знает только domain; M1 чужой модуль — только через его app; M2 нет зависимостей против направления модулей (раздел 2.2);
  P1 platform не знает бизнес-модулей; P2 в platform нет `@RestController` и `@Entity`; E1 ошибки — `DomainException` с `ErrorCode`; E2 причина ошибки — только константа enum (класс/лямбда, реализующие `ErrorCode`, вне `platform.error` запрещены; `ErrorCode.of("...")` удалён), текст — в бандлах, их полноту проверяет `ErrorCatalogTest`; T1 после коммита — только событие
  (`DomainEvents` + `@OnCommitted`); T2 `@Transactional` только на публичных методах app; A1 `CurrentActor` вместо `SecurityUtil`;
  A2 контроллеры не пишут ни аудит, ни журнал активности (это сценарий в app); A3 права аннотациями (`AdminAccess.require*` не вызывают ни api, ни app); N1 Telegram/push только из `notification` и `*Notifier`; K1 нет замков в памяти;
  C1 время через `Clock`/`ShopZone`; V1 нет `@Value`; V2 `@ConfigurationProperties` с `@Validated`; CA кэш только Spring Cache;
  J1 `@Scheduled` только в `*Job(s)` и с `@SchedulerLock`; H1 внешний HTTP через `platform.http`; W1 зависимости только конструктором;
  S1 `JdbcTemplate`/`NamedParameterJdbcTemplate` и `EntityManager.createQuery/createNativeQuery/createNamedQuery` только в слое infra (по слою, не по имени класса); M3 SQL/JPQL модуля трогает только его таблицы и сущности; L5 app не знает `org.springframework.web.*` и `jakarta.servlet.*`; O1 `setStatus` заказа не снаружи. Полный текст — в `V2Rules.RULES`.
- **Как читать сводку.** Каждый прогон печатает таблицу (и кладёт её в `backend/target/architecture-v2-summary.txt`): строки — модули
  (целевые сверху вниз, `platform`, `legacy`), колонки — правила, `.` = ноль, плюс «migrated classes: N of M». Это мерило прогресса:
  шаг миграции модуля считается сделанным, когда его строка пустая, а число классов `legacy` упало на столько, сколько перенесли.
  Команда: `cd backend && mvn -B -ntp test -Dtest=ArchitectureV2Test`.
- **Как обновлять baseline — только вниз.** Исправили нарушения → `mvn -B -ntp test -Dtest=ArchitectureV2Test -Darchitecture.v2.update=true`
  → `git diff v2-baseline.txt` должен показать только уменьшения → закоммитить вместе с исправлением. Режим обновления сам падает, если
  **сумма по правилу** выросла.
  Перенос класса из `legacy` в модуль может сместить счёт между строками (в обычном прогоне CI строка по-прежнему не должна расти,
  поэтому baseline переписывается в том же коммите, что и перенос), но сумма по правилу по всем модулям расти не может.
  Правило, которое выросло **осознанно** (оно стало измеримым, как M1/M2 после появления модулей, или класс переклассифицирован:
  `*Queries`, который оказался сервисом, перестал быть «infra»), называется явно:
  `-Darchitecture.v2.update=true -Darchitecture.v2.allow-growth=M1,M2` — причину пишут в сообщении коммита.
  Полный список нарушений в файл: `-Darchitecture.v2.dump=<файл>` (удобно сравнить до/после переноса). Новое нарушение «чтобы позеленело» в baseline не вносится: чинится код.
- Сами правила проверены на миниатюрном «целевом» проекте `com.maxsolch.shopfixture` (`V2RulesTest`): меняя правило, меняйте и фикстуру.
- **Статус: бэкенд завершён (шаг 8).** Храповик стоит на нуле: `v2-baseline.txt` без записей, любое нарушение любого правила в любом модуле
  валит тест. Старые заморозки (`FreezingArchRule`, `archunit_store`, `large-classes.txt`) удалены, их правила покрыты v2
  (контроллеры не лезут в репозитории — L1/A1, циклы между модулями — M2, `setStatus` — O1). В классе **`legacy`** остался только `TgShopApplication` (точка входа в корневом пакете).
- **Размер файла** — `architecture/ClassSizeTest`: ни один файл в `src/main/java` не длиннее 400 строк, без списка исключений; `architecture/MethodSizeTest` — ни один метод не длиннее 80 строк.
  Растёт класс — выносить логику в отдельный по смыслу, а не поднимать лимит.
- **Шаги 9а/9б: правила по сути, а не по имени.** W1 ловит и `@PersistenceContext`; K1 — замки и конкурентные коллекции (`Concurrent*`, `CopyOnWrite*`)
  по объявленному и по созданному типу; E1 — любой наследник `RuntimeException`, кроме `DomainException`, и `ResponseStatusException` в app/domain;
  R1 — класс вне `<модуль>.{api,app,domain,infra}` и `platform`; C1 — без исключения для `platform`: время только через `Clock`, пояс — только через
  бин `ShopZone` (конструктор `new ShopZone(app.timezone)`, статических `of`/`DEFAULT` нет), `System.currentTimeMillis`/`nanoTime` запрещены.
  Литерал `Europe/Kyiv` допустим только в `AppProperties.DEFAULT_TIMEZONE` (`ShopZoneLiteralTest`).
- **Шаг 9в: события, потоки, мемо.** T3 `ApplicationEventPublisher` только внутри `platform.tx` (`DomainEvents`); T4 слушатели только `@OnCommitted`/`@OnCompleted`
  (`@TransactionalEventListener` вне `platform.tx` запрещён; `@EventListener` допустим только на событиях самого Spring — `ApplicationReadyEvent`, `SessionDisconnectEvent`);
  T5 параметр слушателя — тип из `<модуль>.domain` или `platform`, а класс с именем `*Event(s)` не лежит в app/api/infra; J2 `Executors.*`, `new Thread`,
  `new ThreadPoolExecutor`, `CompletableFuture.*Async` только в `platform.jobs` (`Workers`); K2 `volatile`-поля не `boolean` запрещены (мемо — Spring Cache);
  CA усилено: Caffeine только в `platform.cache`. Новых точечных исключений нет. Проверено фикстурой `BadEvents`; порядок публикаций в транзакциях —
  `OrderEventsPublishedInTransactionTest`, набор слушателей (событие, фаза, fallback) — снимок `EventListenersSnapshotTest`
  (`-Dsnapshot.update=true` только осознанно).
- **Шаг 9д: агрегаты без сеттеров.** O2 вызов `set*` у сущности из `V2Rules.GUARDED` (`Order`, `OrderItem`, `OrderItemLot`, `PaymentInvoice`,
  `OrderReturn`, `OrderReturnLine`) из другого пакета запрещён; O3 у такой сущности нет public `set*` (и `@Setter`). Проверено фикстурой
  (`shopfixture/order/domain/Order`, `BadPractices.overwriteTotal`). Тесты задают состояние через `OrderFixtures.set` (рефлексия), не сеттерами.
- **Шаг 9е: границы без дыр.** M2 теперь ищет и циклы внутри одного яруса (компоненты сильной связности графа модулей): цикл `customer`↔`staff` убран портом `customer.app.AdminCheck`.
  M3 (`SqlOwnership`) читает исходники: строковые литералы SQL/JPQL модуля ищут `FROM/JOIN/UPDATE/INTO <таблица>` и сущности; владелец таблицы — `SqlOwnership.TABLE_OWNERS`, читать любые таблицы
  могут только `analytics`, `finance`, `inbox`; таблица без владельца (`SqlOwnership.unownedTables` по миграциям) — ошибка. Остальное спрашивает владельца через порт: `OrderHistory`, `OnlineVisitors`
  (customer), `JournalOrders`, `JournalPeople` (журнал), `TranslatableSource.orphanTypes()/orphans()` (переводы), названия товаров через `CatalogNames`. L5: `platform.web.UploadedFile` вместо `MultipartFile`,
  cookie доверенного устройства и клиент запроса разбирает `staff.api`. Порты внешних систем: `media.domain.ObjectStore` (MinIO), `media.domain.Imgproxy`, `site.domain.SiteCache` (запрос к сайту) — адаптеры в `infra`.
  Права по `@RequiresFinance` (`platform.security.FinanceGuard`), а не ручными проверками; запись журнала покупателя — в сценариях app (`CustomerOrderActions`, `CustomerGiftCase`, `CartPromo`, ...).
  Проверено фикстурами (`shopfixture/review`, `customer`, `staff`; `V2RulesBoundariesTest`, `SqlOwnershipTest`) и IT на MySQL с «оракулом» (старый SQL внутри теста): `UserAdminIT`, `ActivityLogIT`, `TranslationOrphansIT`, `AdminAccessIT` (403/200 финансовых эндпоинтов).
- **Точечные исключения** (имя класса в `V2Rules.ALLOWED`, причина рядом): S1 — нет исключений; M3 — шесть классов отчётов и сканов (список и причины — ARCHITECTURE.md, раздел 6); A3 — `catalog.app.AdminCatalog`, `translation.app.AdminTranslations` (право зависит от параметра запроса); K1 — `payment.app.CustomerPaymentRefresh` и
  `platform.config.WebSocketConfig` (ARCHITECTURE.md, раздел 6); E1 — `payment.domain.MonobankGateway` (`MonobankException` — сбой порта, всегда перехватывается
  в `payment.app` и превращается в `DomainException`); C1 — `platform.time.TimeConfig` (создаёт системный `Clock` и `ShopZone`), `platform.time.ShopZone`
  (единственное место разбора id пояса), `platform.jobs.DbLocks` (`System.nanoTime` — монотонный дедлайн ожидания замка БД, не дата).
  Остаток для 9г: `ErrorCode.of` и фабрики `*Errors` остаются как есть.
- **Что исключено из правил осознанно.** S1 исключений не имеет: провайдер замков ShedLock строит `platform.infra.LockProviderConfig` (слой infra).
  T1: `@OnCompleted` (AFTER_COMPLETION, срабатывает и при откате) — единственный способ сбросить снимок настроек и после отката.
  Что остаётся в памяти и почему — [ARCHITECTURE.md](ARCHITECTURE.md), раздел 6 «Что остаётся в памяти».

## Фронты (`site/`, `frontend/`, `frontend-admin/`, часть `npm run lint`)

Общие лимиты — `shared/eslint/architecture-limits.mjs`: `complexity` 15, `max-lines` 400 (без пустых строк
и комментариев), `max-depth` 4. Для всех файлов это **error**. Файлы, которые уже нарушали правило, перечислены
**по правилам** в `eslint.legacy-limits.mjs` каждого фронта и получают **warn** только по своему правилу —
долг видно в выводе линтера, но сборку он не валит. Словари `i18n/{en,ru,uk}.ts` — данные, для них `max-lines`
выключен насовсем.

`next build` тоже запускает ESLint, поэтому ошибка лимита в новом файле уронит и Docker-сборку — так и задумано.

## Типы ответов API из OpenAPI (шаг 3 плана фронтов)

Типы ответов генерируются из того, что отдаёт бэкенд, а не пишутся руками.

- **Бэкенд.** `OpenApiSnapshotTest` поднимает контекст (без БД: контроллеры с моками) и снимает `/v3/api-docs`; результат
  сверяется со снимком `backend/src/test/resources/openapi/openapi.json` (ключи отсортированы, `operationId` = `<Контроллер>_<метод>`).
  Обновить: `mvn -B -ntp -q test -Dtest=OpenApiSnapshotTest -Dopenapi.update=true` из папки `backend`. Тот же тест хранит
  `error-codes.json` (коды клиентских ошибок из enum'ов `<Модуль>Error` + два кода security-фильтра) и проверяет, что у каждого
  record-DTO своё имя схемы, а у response-схем нет молча необязательных полей.
- **Строгость.** `OpenApiRecordSchemas` + `OpenApiResponseSchemas`: у схем, достижимых из ответа, каждый компонент record — required,
  `@Nullable` (`org.springframework.lang`) — nullable; enum'ы подключаются `@Schema(implementation = Enum.class)` / `allowableValues`
  без изменения JSON. Свободное значение (`Object`, `Map<String, Object>`) = `unknown`, а не `Record<string, never>`.
  Схемы запросов остаются как читает springdoc по `@NotNull`. Новое поле DTO: nullable? поставь `@Nullable`, иначе тип скажет «всегда есть».
- **Фронт.** `npm run gen:api` = `openapi-typescript` (только dev, ноль рантайма) → `packages/core/src/api/generated.d.ts` +
  `scripts/gen-error-codes.mjs` → `packages/core/src/api/error-codes.d.ts` (union `ServerErrorCode`, его берёт `core/errors`).
  Подключение: `import type { Schemas } from "@shop/core/api/schemas"` и `export type X = Schemas["XDto"]`. Ручной вид ответа
  сужается только как view-модель (`Omit<…> & {…}`) с комментарием.
- **CI.** Шаг «Generated API types are up to date»: `npm run gen:api` + `git diff --exit-code -- packages/core/src/api`.
  `npm run check:golden-schema` (`scripts/check-golden-schema.mjs`) сверяет настоящие ответы заказа (golden-JSON) со схемами:
  лишний ключ, пропавший required, null в non-nullable, не тот вид значения, значение не из enum. Три устаревших значения в синтетических
  фикстурах (`rejectReasonCode: UNPAID`, `movements.kind: RECEIVED`, `movements.channel: MONOBANK`) пропускаются явно (`STALE_ENUM_PATHS`).
- **Правило.** `scripts/check-api-types.mjs` (в `arch:front`): в пилотных модулях order и catalog нельзя объявлять руками типы ответов
  из списка `GENERATED_ONLY`; в `frontend-admin/lib/orders-api.ts` ручные интерфейсы — только тела запросов.
  Переезжает ещё модуль — добавь его имена в список.

Заменил `check-dto-drift.mjs` (сверял TS-типы с golden-образцами): теперь сверяется сама схема, а TS-типы сгенерированы из неё.

## Что делать, если проверка упала

1. **Сначала — исправить код**, а не список: вынести новую логику в отдельный класс/компонент в пакете фичи,
   переход статуса — через один метод с проверками, доступ к данным — через сервис. Это и есть смысл проверок.
2. Добавлять исключение можно, только если нарушение осознанное и у него есть причина, которую можно написать
   одной строкой (например, сгенерированный код или временный перенос, который закончится в следующем коммите).
   Причину — в сообщении коммита. Исключение «чтобы CI позеленел» — это ровно тот костыль, ради которого
   проверки заведены: каждый такой пункт делает следующий легче и через месяц список снова никого не держит.
3. Как добавить исключение во фронтах, если оно действительно нужно: путь файла в нужный массив `eslint.legacy-limits.mjs`
   (путь от корня фронта, скобки в `app/[locale]/…` экранирует helper). В бэкенде исключений нет: ни baseline, ни список размеров.
4. Новое правило бэкенда: добавить в `V2Rules` и фикстуру `shopfixture` (`V2RulesTest`); в коде оно должно сразу давать ноль.

## Фронты: храповик шага 0 (`npm run arch:front`, `npm run check:bundle`)

План — [ARCHITECTURE-FRONT.md](ARCHITECTURE-FRONT.md) (2.5, 2.7). Принцип тот же, что у бэкенда: **число нарушений только падает**, ноль = правило становится error.
Корневые `npm run lint | typecheck | test | arch:front | build` обходят **все** workspaces (`shared`, `frontend`, `frontend-admin`, `site`; `typecheck` ещё и `e2e`).

- **ESLint-храповик.** Счётные правила (warn) — `shared/eslint/front-rules.mjs`: `no-fetch`, `no-web-storage`, `no-confirm-alert`, `query-key-literal`,
  `stale-time-literal`, `refetch-interval-literal`, `money-div-mul-100`, `to-fixed`, `time-new-date`, `time-date-now`, `time-to-locale`, `time-intl-datetimeformat`,
  `cyrillic-literal` (только Mini App и сайт; словари `i18n/**` не считаются), плюс `react-hooks/exhaustive-deps`, `max-lines`, `max-lines-per-function` (200), `complexity`, `max-depth`.
  `scripts/check-front-ratchet.mjs` запускает ESLint с `--no-inline-config` (то есть `eslint-disable` не прячет долг), печатает сводку «правило × приложение» и сравнивает
  с `scripts/frontend-baseline.txt` (`<правило> <приложение> <число>`). Рост — падение; снижение — подсказка; понизить: `node scripts/check-front-ratchet.mjs --update`
  (рост без `--allow-growth=<правила>` команда не запишет; причину роста — в сообщение коммита). По правилу ноль → переключить в error и убрать строки из baseline.
  Исключения у правил — только файлы, ради которых правило есть (`shared/src/http.ts` для `fetch`, `shared/src/money.ts`/`format.ts`, `site/lib/server-api.ts`).
- **Запреты совместимости (error, `docs/BROWSER-SUPPORT.md`).** Lookbehind (литерал и `new RegExp("…")`), флаг `v`, `static {}`, `toSorted/toReversed/toSpliced`, `Set#isSubsetOf…`,
  `Object/Map.groupBy`, `Promise.withResolvers`, `Array.fromAsync` — в Mini App, сайте и `shared`; в админке (десктоп) не действуют; `site/lib/feeds.ts` (XML рендерит сервер) — исключение.
- **dependency-cruiser.** Правила — `.dependency-cruiser.cjs` (циклы, чужое приложение, ядро без React, `components → app`, WebSocket только из `realtime.ts`, границы будущих `features/*`).
  `scripts/check-arch-front.mjs`: новое нарушение, которого нет в `known-violations.json`, — падение; стало меньше — `node scripts/check-arch-front.mjs --update`.
- **Инварианты** `scripts/check-invariants.mjs`: `CHUNK_RECOVERY_SCRIPT` первым в `<head>` обоих layout, `no-cache` для HTML в `infra/gateway.conf` и `gateway-site.conf`, нет lookbehind.
- **Бандл** `scripts/check-bundle.mjs` (после `npm run build`): First Load JS (gzip) каждого маршрута Mini App и сайта против `scripts/bundle-baseline.txt`, рост > 3 % — падение.
- **Тесты:** `vitest` в каждом workspace (`*.test.ts` рядом с кодом), `npm run test`.
