# tg-shop-v2 — правила для сессий

- Код сайта (`site/`), Mini App (`frontend/`) и `shared/` должен работать на **iOS Safari 15.4+ и Chrome 92+**.
  Перед тем как писать регулярки, новые API JS/CSS — смотри [docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md):
  там список запрещённого и фоллбеки. Lookbehind `(?<=`/`(?<!` во фронтах запрещён.
- После сборки: `node scripts/check-browser-compat.mjs site frontend` (то же делает CI).
- Не убирать `CHUNK_RECOVERY_SCRIPT` из `<head>` и `no-cache` для HTML в `infra/gateway*.conf` — это защита
  от рассинхрона версий после релизов.
- Репозиторий публичный: секреты, IP-логины, реквизиты не коммитить.

## Архитектура (общие правила кода — в `~/.claude/CLAUDE.md`, раздел «Как писать код»)

Целевая структура бэкенда **утверждена** — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (модули, шаблон `api/app/domain/infra`,
единые способы «как делаем», порядок переезда). Переезд идёт в ветке `arch/v2` по шагам; прогресс — сводка ArchUnit v2
(`mvn test -Dtest=ArchitectureV2Test`), как читать — [docs/ARCHITECTURE-CHECKS.md](docs/ARCHITECTURE-CHECKS.md).

Кратко (полный список — в ARCHITECTURE.md, раздел 3):
- Код по бизнес-модулям `com.maxsolch.shop.<модуль>.{api,app,domain,infra}` + `platform`; не в `service/`, `web/`, `repository/`.
- `api → app → domain`, `infra → domain`; другой модуль — только через его `app`; циклов между модулями нет.
- Ошибки — `platform.error.DomainException` с `ErrorCode`; после коммита — доменное событие
  + `@TransactionalEventListener(AFTER_COMMIT)` (`platform.tx.DomainEvents`); время — `Clock` + `ShopZone`; текущий админ — `CurrentActor`;
  настройки — `@ConfigurationProperties` (не `@Value`); фоновая задача — `@Scheduled` + `@SchedulerLock`;
  внешний HTTP — через `platform.http` (таймауты обязательны, ретрай только идемпотентных).
- Статус заказа — только методами `Order`; деньги — minor-единицы, формулы в `OrderMoney`.
- Не дописывать в `NotificationService`, `AdminOrderController`:
  новая логика — отдельный класс в модуле. Контроллеры тонкие.
- Число нарушений в `v2-baseline.txt` только уменьшается. Упала проверка — чинить код, не baseline.
