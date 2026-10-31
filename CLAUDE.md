# tg-shop-v2 — правила для сессий

- Код сайта (`site/`), Mini App (`frontend/`) и `shared/` должен работать на **iOS Safari 15.4+ и Chrome 92+**.
  Перед тем как писать регулярки, новые API JS/CSS — смотри [docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md):
  там список запрещённого и фоллбеки. Lookbehind `(?<=`/`(?<!` во фронтах запрещён.
- После сборки: `node scripts/check-browser-compat.mjs site frontend` (то же делает CI).
- Не убирать `CHUNK_RECOVERY_SCRIPT` из `<head>` и `no-cache` для HTML в `infra/gateway*.conf` — это защита
  от рассинхрона версий после релизов.
- Репозиторий публичный: секреты, IP-логины, реквизиты не коммитить.

## Архитектура (общие правила кода — в `~/.claude/CLAUDE.md`, раздел «Как писать код»)

Целевая структура бэкенда **утверждена, переезд завершён** — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (модули, шаблон `api/app/domain/infra`,
единые способы «как делаем», что осталось в памяти процесса). Проверки — ArchUnit v2 (`mvn test -Dtest=ArchitectureV2Test`) и
`ClassSizeTest`, как читать — [docs/ARCHITECTURE-CHECKS.md](docs/ARCHITECTURE-CHECKS.md).

Кратко (полный список — в ARCHITECTURE.md, раздел 3):
- Код по бизнес-модулям `com.maxsolch.shop.<модуль>.{api,app,domain,infra}` + `platform`; не в `service/`, `web/`, `repository/`.
- `api → app → domain`, `infra → domain`; другой модуль — только через его `app`; циклов между модулями нет.
- Ошибки — `platform.error.DomainException` с `ErrorCode`; после коммита — доменное событие
  + `@OnCommitted` (`platform.tx.DomainEvents`; события в `<модуль>.domain`, потоки — `platform.jobs.Workers`, кэши — `CacheSpec`); время — `Clock` + `ShopZone`; текущий админ — `CurrentActor`;
  настройки — `@ConfigurationProperties` (не `@Value`); фоновая задача — `@Scheduled` + `@SchedulerLock`;
  внешний HTTP — через `platform.http` (таймауты обязательны, ретрай только идемпотентных).
- Статус заказа — только методами `Order`; деньги — minor-единицы, формулы в `OrderMoney`.
- Не дописывать в `NotificationService`, `AdminOrderController`:
  новая логика — отдельный класс в модуле. Контроллеры тонкие.
- Нарушений ноль, исключений нет: `v2-baseline.txt` пустой, файл ≤ 400 строк, метод ≤ 80. Упала проверка — чинить код, а не записывать в baseline.
- Замок, защищающий деньги/данные от двойного выполнения, — только в БД (`platform.jobs.DbLocks`, `@SchedulerLock`); `synchronized` и карты замков запрещены (K1).
  `spring.jpa.open-in-view: false`: то, что рендерит контроллер, загружается внутри транзакции app (fetch join / read-модель).

## Фронты: проверки (шаг 0 плана ARCHITECTURE-FRONT.md)

- Перед пушем: `npm run lint && npm run typecheck && npm run test && npm run arch:front && npm run build`, затем `node scripts/check-browser-compat.mjs site frontend` и `npm run check:bundle`.
- Храповик: `scripts/frontend-baseline.txt`, `known-violations.json`, `scripts/bundle-baseline.txt` — числа только падают; упало — чинить код, не поднимать baseline ([docs/ARCHITECTURE-CHECKS.md](docs/ARCHITECTURE-CHECKS.md)).

## Фронты: куда класть код (архитектура v2, [docs/ARCHITECTURE-FRONT.md](docs/ARCHITECTURE-FRONT.md))

- `packages/core` — чистая логика без React (деньги, время, форматы, корзина, каталог, ошибки, HTTP, OpenAPI-типы); `packages/ui` — общие UI-примитивы (toast, модалки, кейс подарка);
  `packages/customer` — то, что одинаково у Mini App и сайта (заказ, чат, поддержка, оформление, **общий словарь** `src/i18n/shared-{ru,uk,en}.ts`, аналитика).
- Приложение (`frontend/`, `frontend-admin/`, `site/`): `features/<фича>/{ui,model,queries,api}` + `index.ts`; из другой фичи — только через `index.ts` или `view/<Модуль>.ts`.
  `app/` — тонкие страницы (импортируют вход своего экрана, не общий barrel: barrel раздувает бандл). Mini App: `shell/` (TabBar, Providers), `platform/telegram/*`.
  Сайт: серверный код — `features/*/server` с `import "server-only"`; клиентский код его не импортирует.
- Один способ: деньги — `core/money`, время — `core/time` (`now()`), запросы — `HttpClient` из `core/http`, хранилище — `core/storage`, ошибки — `ApiError`, `useApiMutation`/`useConfirm`/`toast` из `ui`,
  тексты — `t(MessageKey)` (общий ключ — в shared-словарь, не в приложение). Типы ответов — из `packages/core/src/api/generated.d.ts` (`npm run gen:api`).
- Лимиты — **error без исключений**: complexity ≤ 15, файл ≤ 400 строк, функция ≤ 200, глубина ≤ 4. Новый файл-исключение не заводим.
