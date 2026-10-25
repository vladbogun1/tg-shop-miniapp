# Halloween 2026: «Хеллоуїн-полювання» + розыгрыш на стриме

Статус: `active` до 31.10.2026, потом удалить (см. «Как удалить»).

Временная акция, отдельный сервис рядом с магазином:

- **Тыквы.** 26–30.10 на сайте и в Mini App иногда выглядывают тыквы. Тап по тыкве засчитывает её, если покупатель вошёл через Telegram. 50 тыкв дают 1 билет, за день засчитывается не больше 15.
- **Заказы.** Каждый заказ за неделю даёт +1 билет: он оплачен или принят и не отклонён.
- **Кодовые слова.** Слово называют на стриме, оно даёт +N тыкв. Число вводов ограничено, один человек вводит слово один раз.
- **Розыгрыш.** В пятницу 30.10 вечером на стриме, экран `/hw/draw/` на домене админки, 5 раундов. Шанс пропорционален билетам, один человек выигрывает один раз.
- **Заказов не создаёт.** Призы Максим выдаёт сам, контакты победителей есть на экране розыгрыша.

Правила акции для покупателей: `site/content/legal/{uk,ru,en}/halloween-rules.md`, на сайте это `/halloween-rules`.

## Из чего состоит

| Часть | Где | Что делает |
|---|---|---|
| Сервис `halloween` | `events/halloween/server` (Node 22, без фреймворков) | API `/hw/api/*`, раздаёт `/hw/spawner.js`, `/hw/sprites/`, `/hw/draw/` |
| Своя база | SQLite в volume `halloween_data` (`/data/halloween.db`) | выданные/собранные тыквы, кодовые слова, фиксация списка, роллы |
| База магазина | MySQL, **только чтение**: `orders`, `users`, `admin_users` | заказы за неделю, имена/аватарки, кого исключить (админы) |
| Виджет тыкв | `public/spawner.js` (vanilla, shadow DOM) | тыквы, счётчик `<hw-counter>`, панель акции, ввод кода |
| Экран розыгрыша | `draw/` (`host.js` + визуалы в `draw/visuals/*`, контракт в `draw/VISUAL-CONTRACT.md`) | выбор визуала, ролл, перекрут, фиксация списка, контакты, коды, доказ |
| Тема Хеллоуина | `site/components/event/*`, `frontend/components/Halloween.tsx` + `halloween.css`, `site/components/scene/SceneFx.tsx` (летучие мыши, цветные искры) | включается сама по дате, `isHalloween()` в `shared/src/event.ts` (до 01.11 00:00 Киев) |
| Хеллоуин-ассеты | `site/public/mascot-hw/`, `site/public/case-hw/`, `frontend/public/case-hw/` | на время акции middleware подменяет `/mascot/*` → `/mascot-hw/*`, `/case/*` → `/case-hw/*`, но только файлы из списка `shared/src/event-assets.ts`. Добавили или убрали картинку — `node events/halloween/tools/hw-manifest.mjs` |
| Шлюзы | `infra/gateway*.conf`, блоки `location /hw/` | проксируют на `halloween:8090`. На сайте и в app закрыты `/hw/draw` и `/hw/api/admin` |
| Пункт меню | `frontend-admin/components/layout/Shell.tsx` | «Розыгрыш 🎃» в «Клиенты», открывает `/hw/draw/` в новой вкладке |

### Вход

Сервис проверяет JWT магазина тем же `JWT_SECRET` (HS256, `sub` = Telegram id):

- **Сайт:** HttpOnly-кука `access`. Протухшую виджет обновляет через `refreshSession()` сайта.
- **Mini App:** bearer-токен из памяти приложения.
- **Админка:** `localStorage.tgshop_admin_jwt` на домене админки. Роль `ADMIN` дополнительно проверяется через `GET /api/admin/account` бэкенда, раз в 60 с, поэтому отозванный админ отваливается.

### Честность розыгрыша

1. «Зафіксувати список» на экране делает снимок участников и билетов. Если не нажать, снимок делается сам при первом ролле. Одновременно генерируется секрет `seed`.
2. На экране сразу показывается `commitment = sha256(seed + ":" + sha256(snapshot))`, его видят зрители.
3. Победитель раунда: `HMAC-SHA256(seed, "round:attempt") mod сумма билетов` среди тех, кто ещё не выигрывал.
4. «Перекрутити раунд» аннулирует последнего победителя. Этот человек больше не участвует, потому что не ответил за 48 часов.
5. «Доказ (json)» выгружает seed, снимок и все роллы, по ним любой может пересчитать результат.

## Настройки (`.env` рядом с compose)

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `JWT_SECRET` | уже есть у магазина | подпись токенов |
| `HW_DB_USER` / `HW_DB_PASSWORD` | пусто | read-only пользователь MySQL. Пусто = заказы не считаются |
| `HW_STARTS_AT` / `HW_ENDS_AT` | `2026-10-25T22:00Z` / `2026-10-30T22:00Z` | окно тыкв (Киев UTC+2) |
| `HW_ORDERS_FROM` / `HW_ORDERS_TO` | как окно тыкв | окно заказов |
| `HW_STREAM_AT` | `2026-10-30T17:00Z` | время стрима в панели (19:00 Киев) |
| `HW_STREAM_URL` | пусто | ссылка на стрим в панели |
| `HW_GOAL` / `HW_DAILY_CAP` | 50 / 15 | тыкв на билет / в день |
| `HW_EXCLUDE_IDS` | `9000000000000001` | Telegram id через запятую, не участвуют (техадмин и тестовые) |
| `HW_SPAWN_GAP_SEC`, `HW_SPAWN_TTL_SEC`, `HW_MIN_REACT_MS`, `HW_IP_DAILY_CAP`, `HW_ROUNDS`, `HW_TZ_OFFSET_MIN` | см. `server/src/config.js` | антибот и лимиты |
| `HW_DEV_AUTH=1` | выкл | **только локально**: `?dev=<tgId>` для покупателя, `Bearer dev-admin` для админа |

Read-only пользователь MySQL (один раз, под root в контейнере mysql). Пароль сгенерировать и положить в `.env` на сервере, в чат и в git не писать:

```sql
CREATE USER 'hw_ro'@'%' IDENTIFIED BY '<пароль>';
GRANT SELECT ON <DB_NAME>.orders TO 'hw_ro'@'%';
GRANT SELECT ON <DB_NAME>.users TO 'hw_ro'@'%';
GRANT SELECT ON <DB_NAME>.admin_users TO 'hw_ro'@'%';
```

## Запуск

На сервере, рядом с основным compose:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.halloween.yml up -d --build halloween
```

Шлюзы находят контейнер через resolver: пока его нет, `/hw/` отвечает 502, а виджет молча не показывается.

Локально, без магазина:

```bash
cd events/halloween/server && npm install && HW_DEV_AUTH=1 HW_STARTS_AT=2026-10-01T00:00:00Z JWT_SECRET=eA== node src/server.js
```

Дальше:

- `http://localhost:8090/hw/draw/?mock=180&visual=roulette` — экран розыгрыша на выдуманных участниках (`?mock=N`, любой `visual` из `draw/visuals/`).
- `http://localhost:8090/hw/draw/` с `localStorage.tgshop_admin_jwt = "dev-admin"` — экран на данных сервиса.

Клавиши экрана: **R** — крутить, **H** — спрятать панель (для OBS), **M** — звук.

## Перед стримом (чек-лист)

1. Открыть `admin.<домен>/hw/draw/`, войти в админку на этом же домене.
2. Выбрать визуал, проверить звук и аватарки. Если кто-то против аватарок на экране, снять галку «аватарки».
3. Исключить читеров, если нужно (`POST /hw/api/admin/exclude {id}`). Это возможно только до фиксации.
4. «Зафіксувати список» → сказать на стриме, что отпечаток на экране.
5. R × 5. После стрима: «Контакти переможців» (не показывать на стриме!), затем «Доказ (json)» сохранить.

## Как удалить (после 01.11)

Тема и тыквы выключаются сами по дате, но код лучше убрать:

1. `docker compose ... rm -sf halloween`, сохранить `docker cp tgshop_v2_halloween:/data ./_backups/...` (если нужно), `docker volume rm <project>_halloween_data`. Удалить пользователя `DROP USER 'hw_ro'@'%';`.
2. Удалить `events/halloween/`, `docker-compose.halloween.yml`, `HW_*` из `.env`.
3. Удалить блоки `location /hw/` и `^~ /hw/(draw|api/admin)` из `infra/gateway.conf`, `gateway-site.conf`, `gateway-admin.conf`.
4. Сайт:
   - удалить `site/components/event/`, `site/app/[locale]/halloween-rules/`, `site/content/legal/*/halloween-rules.md`, `site/public/mascot-hw/`, `site/public/case-hw/`;
   - убрать `halloweenRules` из `site/lib/legal.ts`;
   - убрать `HalloweenWidget`/`data-event` из `site/app/[locale]/layout.tsx` и `HalloweenCounter` из `site/components/layout/Header.tsx`;
   - убрать подмену `-hw` из `site/middleware.ts`;
   - убрать `batFlock` и `halloween`-ветку из `site/components/scene/SceneFx.tsx`.
5. Mini App: удалить `frontend/components/Halloween.tsx`, `frontend/components/halloween.css`, `frontend/middleware.ts`, `frontend/public/case-hw/`, убрать их использование в `frontend/app/layout.tsx` и `frontend/app/page.tsx`.
6. Админка: пункт «Розыгрыш 🎃» и поле `external` в `frontend-admin/components/layout/Shell.tsx`.
7. Shared: `shared/src/event.ts`, `shared/src/event-assets.ts`, экспорт в `shared/src/index.ts` и `"./event"` в `shared/package.json`.

Проверка, что ничего не осталось: `git grep -n -i "halloween\|/hw/\|isHalloween\|-hw/"`.
