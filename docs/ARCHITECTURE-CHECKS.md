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
  P1 platform не знает бизнес-модулей; E1 ошибки — `DomainException` с `ErrorCode`; T1 после коммита — только событие
  (`DomainEvents` + `@OnCommitted`); T2 `@Transactional` только на публичных методах app; A1 `CurrentActor` вместо `SecurityUtil`;
  A2 контроллеры не пишут аудит; A3 права аннотациями; N1 Telegram/push только из `notification` и `*Notifier`; K1 нет замков в памяти;
  C1 время через `Clock`/`ShopZone`; V1 нет `@Value`; V2 `@ConfigurationProperties` с `@Validated`; CA кэш только Spring Cache;
  J1 `@Scheduled` только в `*Job(s)` и с `@SchedulerLock`; H1 внешний HTTP через `platform.http`; W1 зависимости только конструктором;
  S1 `JdbcTemplate` только в infra/`*Store`/`*Queries`; O1 `setStatus` заказа не снаружи. Полный текст — в `V2Rules.RULES`.
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
- **Размер файла** — `architecture/ClassSizeTest`: ни один файл в `src/main/java` не длиннее 500 строк, без списка исключений.
  Растёт класс — выносить логику в отдельный по смыслу, а не поднимать лимит.
- **Шаги 9а/9б: правила по сути, а не по имени.** W1 ловит и `@PersistenceContext`; K1 — замки и конкурентные коллекции (`Concurrent*`, `CopyOnWrite*`)
  по объявленному и по созданному типу; E1 — любой наследник `RuntimeException`, кроме `DomainException`, и `ResponseStatusException` в app/domain;
  R1 — класс вне `<модуль>.{api,app,domain,infra}` и `platform`; C1 — без исключения для `platform`: время только через `Clock`, пояс — только через
  бин `ShopZone` (конструктор `new ShopZone(app.timezone)`, статических `of`/`DEFAULT` нет), `System.currentTimeMillis`/`nanoTime` запрещены.
  Литерал `Europe/Kyiv` допустим только в `AppProperties.DEFAULT_TIMEZONE` (`ShopZoneLiteralTest`).
- **Точечные исключения** (имя класса в `V2Rules.ALLOWED`, причина рядом): S1 — `platform.jobs.JobsConfig`; K1 — `payment.app.CustomerPaymentRefresh` и
  `platform.config.WebSocketConfig` (ARCHITECTURE.md, раздел 6); E1 — `payment.domain.MonobankGateway` (`MonobankException` — сбой порта, всегда перехватывается
  в `payment.app` и превращается в `DomainException`); C1 — `platform.time.TimeConfig` (создаёт системный `Clock` и `ShopZone`), `platform.time.ShopZone`
  (единственное место разбора id пояса), `platform.jobs.DbLocks` (`System.nanoTime` — монотонный дедлайн ожидания замка БД, не дата).
  Остаток для 9г: `ErrorCode.of` и фабрики `*Errors` остаются как есть.
- **Что исключено из правил осознанно.** S1: `platform.jobs.JobsConfig` (создаёт `JdbcLockProvider` ShedLock — он и есть слой хранения замков).
  T1: `@OnCompleted` (AFTER_COMPLETION, срабатывает и при откате) — единственный способ сбросить снимок настроек и после отката.
  Что остаётся в памяти и почему — [ARCHITECTURE.md](ARCHITECTURE.md), раздел 6 «Что остаётся в памяти».

## Фронты (`site/`, `frontend/`, `frontend-admin/`, часть `npm run lint`)

Общие лимиты — `shared/eslint/architecture-limits.mjs`: `complexity` 15, `max-lines` 400 (без пустых строк
и комментариев), `max-depth` 4. Для всех файлов это **error**. Файлы, которые уже нарушали правило, перечислены
**по правилам** в `eslint.legacy-limits.mjs` каждого фронта и получают **warn** только по своему правилу —
долг видно в выводе линтера, но сборку он не валит. Словари `i18n/{en,ru,uk}.ts` — данные, для них `max-lines`
выключен насовсем.

`next build` тоже запускает ESLint, поэтому ошибка лимита в новом файле уронит и Docker-сборку — так и задумано.

## Дрифт Java DTO заказа ↔ TypeScript-типы (`scripts/check-dto-drift.mjs`, шаг в джобе `frontends`)

Типы заказа написаны руками в `shared/src/types.ts`, `frontend-admin/lib/{api,orders-api}.ts` и `e2e/lib/api.ts`,
а Java DTO правятся часто. Эталон — golden-JSON `backend/src/test/resources/golden/order/*.json` (реальный ответ API;
его уже охраняет `OrderQueryServiceGoldenTest`). Скрипт строит TS-тип через compiler API (tsconfig пакета) и рекурсивно
сверяет с JSON: ключ есть в JSON, но нет в типе (тип устарел); обязательного поля типа нет в JSON (убрали/переименовали в DTO);
необязательное поле типа не встречается ни в одном образце; вид значения (null/число/строка/массив) не допускается типом.
`e2e` и `shared` проверяются в режиме `subset` (минимальные/базовые типы: лишние ключи JSON — норма).

**Почему так.** Присваивание JSON типу (`resolveJsonModule` + `satisfies`) не годится: JSON-литералы расширяются
(`"NEW"` → `string`, не лезет в `OrderStatus`), а пропавшие необязательные поля и лишние ключи оно не ловит.
Генерация через springdoc/OpenAPI — новая зависимость в backend, генератор и перегенерация типов, дороже. Скрипт — 200 строк,
без зависимостей сверх `typescript`, и бежит в уже существующей джобе за секунды. Слабое место: покрытие = набор образцов в
golden (поле, которого нет ни в одном образце, считается пропавшим — тогда добавьте образец в golden-тест).

Запуск: `npm run check:dto-drift`. Поменяли DTO → бэкенд перегенерирует golden (`-Dgolden.update=true`) → скрипт покажет,
какой TS-тип поправить. Исключения — `EXCEPTIONS` в начале скрипта (с причиной, список может только уменьшаться; исключение,
которое перестало срабатывать, тоже падает). Сейчас там: `deliveryMethod` и `items[].id` = null (артефакт фикстуры) и мёртвое
`OrderItem.currency` (читается фоллбеком на странице заказа Mini App — убрать вместе с кодом).

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
