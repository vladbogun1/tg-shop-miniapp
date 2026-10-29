# Halloween 2026: «Хеллоуїн-полювання» + розыгрыш на стриме

Статус: `active` до 02.11.2026, потом удалить (см. «Как удалить»).

Временная акция, отдельный сервис рядом с магазином:

- **Два отдельных розыгрыша** (`server/src/pools.js`), окно 30.10 00:00 – 01.11 18:00 по Киеву, стрим 01.11 19:00 в TikTok и Kick:
  - **за тыквы** — все, у кого есть хоть 1 тыква. Неполный набор — 1 билет за тыкву, полный (15) — от 100 билетов и больше: вес полного поднимается так, чтобы все неполные вместе держали не больше `HW_PARTIAL_SHARE` (10 %). Симуляция: неполным уходит 10–13 % призов, один «1 тыква» — сотые доли процента. Не больше 8 тыкв в день;
  - **за покупки** — сумма заказов в окне от 500 ₴ (оплачен или принят, минус возвраты и невыкуп): билет за каждые 500 ₴, до 5.
  По 10 раундов в каждом, внутри розыгрыша один человек выигрывает один раз, выиграть в обоих можно.
- **Экран** `/hw/draw/` на домене админки, переключатель «Розыгрыш за тыквы / за покупки» (`?pool=`).
- **Уведомления ботом** (`server/src/notify.js`, `HW_NOTIFY=1`): «первая тыква — ты в розыгрыше, шанс пока мал», «15 собрано — полный шанс», «ты в розыгрыше за покупки», напоминание за час до стрима. Раз на человека и вид, таблица `notified`.
- **Где об этом узнают.** Сайт: баннер на главной — только акция, остальные слайды скрыты до конца стрима (`HUNT_UNTIL` в `shared/src/event.ts`). Mini App: карточка под шапкой главной: «Охота на тыквы» → «Скоро розыгрыш» → «Розыгрыш идёт сейчас» (три часа от `HW_STREAM_AT`, тап открывает первую ссылку `HW_STREAMS`).
- **Заказов не создаёт.** Призы Максим выдаёт сам, контакты победителей есть на экране розыгрыша.

Правила акции для покупателей: `site/content/legal/{uk,ru,en}/halloween-rules.md`, на сайте это `/halloween-rules`.

## Из чего состоит

| Часть | Где | Что делает |
|---|---|---|
| Сервис `halloween` | `events/halloween/server` (Node 22, без фреймворков) | API `/hw/api/*`, раздаёт `/hw/spawner.js`, `/hw/sprites/`, `/hw/draw/` |
| Своя база | SQLite в volume `halloween_data` (`/data/halloween.db`) | выданные/собранные тыквы, фиксация списка, роллы |
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
| `HW_STARTS_AT` / `HW_ENDS_AT` | `2026-10-29T22:00Z` / `2026-11-01T16:00Z` | окно тыкв (Киев UTC+2) |
| `HW_ORDERS_FROM` / `HW_ORDERS_TO` | как окно тыкв | окно заказов |
| `HW_STREAM_AT` | `2026-11-01T17:00Z` | время стрима (19:00 Киев) |
| `HW_STREAMS` | TikTok и Kick | `Имя\|https://…` через запятую |
| `HW_GOAL` / `HW_DAILY_CAP` / `HW_FULL_WEIGHT` | 15 / 8 / 100 | полный набор / тыкв в день / вес полного набора |
| `HW_MIN_SPEND_UAH` / `HW_MAX_ORDER_TICKETS` | 500 / 5 | порог розыгрыша за покупки / потолок билетов |
| `HW_ROUNDS_PUMPKINS` / `HW_ROUNDS_ORDERS` | 10 / 10 | раунды (призы) каждого розыгрыша |
| `HW_NOTIFY` / `HW_NOTIFY_ONLY` | 0 / пусто | уведомления ботом (токен = `BOT_TOKEN`) / только эти tg id (демо) |
| `HW_EXCLUDE_IDS` | `9000000000000001` | Telegram id через запятую, не участвуют (техадмин и тестовые) |
| `HW_SPAWN_GAP_SEC`, `HW_SPAWN_TTL_SEC`, `HW_MIN_REACT_MS`, `HW_IP_DAILY_CAP`, `HW_TZ_OFFSET_MIN` | см. `server/src/config.js` | антибот и лимиты |
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

### На локальном стенде (данные прода, shop-local-stand)

- Сервис: `cd events/halloween/server && node --env-file=../_tmp/local.env src/server.js`. В `_tmp/local.env` (в git не попадает) лежат `JWT_SECRET` стенда, read-only пользователь `hw_ro` на `uxtest_mysql` :3398, `HW_BACKEND_URL=http://localhost:8080` и ранний `HW_STARTS_AT`.
- Фронты из ветки: записи `halloween-site` (:3046), `halloween-admin` (:3047), `halloween-miniapp` (:3048) в `shop/.claude/launch.json`. `/hw/` в `next dev` проксируется на :8090 (rewrites в `next.config.ts`).
- Админка на стенде входит сама, без пароля и кода: `DEV_ADMIN_CREDS=<путь к local.json>` + `next dev` (`frontend-admin/app/dev-login/route.ts`). В сборке для прода маршрут отвечает 404. Токен один на все вкладки (кэш до истечения, один вход за раз): иначе каждая вкладка входила заново, повторный код 2FA засчитывался ошибкой, и бэкенд блокировал админа (5 ошибок → 15 мин) и IP (10 входов за 5 мин → 429). Снять блокировку на стенде: `docker restart cmp_backend` (лимит по IP в памяти) и `UPDATE admin_users SET failed_attempts=0, locked_until=NULL`.
- Mini App на :3048: порт 3004 бывает занят, поэтому API идёт через dev-прокси (`NEXT_PUBLIC_API_BASE_URL=http://localhost:3048`, `DEV_API_ORIGIN=http://localhost:8080`).
- Открыть: сайт `http://localhost:3046`, Mini App `http://localhost:3048/?tgstub=502540144`, розыгрыш `http://localhost:3047/hw/draw/`.

### Призы и сообщение победителю

- «Призи» на панели: паки (название + что внутри), какой пак в каком раунде, шаблон сообщения ({name}, {round}, {prize}, {items}). Приз следующего раунда можно сменить и в списке рядом с «Крутити». Хранится в SQLite сервиса (`server/src/prizes.js`), визуал показывает его через `setPrize` / `info.prize`.
- «Написати переможцю» (после ролла) и «Написати» в «Контакти переможців»: заполненный шаблон, можно поправить, «Надіслати». Сервис вызывает бэкенд `POST /api/admin/support/threads` {userId, subject, text} с токеном админа: открывается чат магазина, покупатель получает от бота сообщение с кнопкой в чат, ответ приходит в «Чати» админки. **Нужен бэкенд из этой ветки** (эндпоинт новый, без миграций).
- В тестовом режиме сообщение уходит в чат самому админу с пометкой «[ТЕСТ…]».
- На стенде бэкенд этой ветки поднят вторым контейнером `cmp_backend_hw` на :8079 (та же база, бот выключен), `HW_BACKEND_URL=http://localhost:8079` в `_tmp/local.env`.

### Тестовый розыгрыш (репетиция)

Галка «тестовий» на экране розыгрыша (`/hw/draw/?test=1`): случайные 80 покупателей из базы магазина (имена и аватарки из Telegram) с выдуманными тыквами, заказами и билетами. Всё в памяти сервиса (`server/src/test-draw.js`, маршруты `/hw/api/admin/test/*`): настоящий список, фиксация и раунды не меняются. «Нові учасники» — другой набор, раунды с нуля. Красная плашка «ТЕСТ» видна и со спрятанной панелью. Контактов и доказа в тесте нет.

Клавиши экрана: **R** — крутить, **H** — спрятать панель (для OBS), **F** — на весь экран, **M** — звук. Еле заметные подсказки клавиш справа; `?hints=0` их убирает.

## Перед стримом (чек-лист)

Бот сам никому не пишет (`HW_NOTIFY=0` на проде) — посты и рассылку публикуют вручную.

1. До 18:00 01.11 — сказать на стриме, что после 18:00 тыквы и заказы не засчитываются.
2. После 18:00 открыть `admin.<домен>/hw/draw/`, войти в админку на этом же домене. Прогнать оба розыгрыша в тестовом режиме (`?test=1`): звук, аватарки, «Написати переможцю» (придёт тебе).
3. «Призи»: по паку на каждый раунд, 10 + 10. Раунды меняются только в `.env` (`HW_ROUNDS_*`) с рестартом — решить до эфира.
4. Исключить читеров, если нужно (`POST /hw/api/admin/exclude {id}`, кнопки пока нет). Только до фиксации.
5. «Зафіксувати список» в **обоих** розыгрышах (переключатель вверху) — до 18:00 сервер не даст. Сказать на стриме, что отпечатки на экране.
6. **H** — спрятать панель для OBS. **R** — один раунд; двойное нажатие второй раунд не сожжёт, сервер откажет.
7. После раунда — «Написати переможцю» (панель скрыта от эфира). «Перекрутити» только если победитель не отвечает: он выбывает насовсем.
8. Перед отправкой приза за покупки — проверить заказ победителя в админке (возврат после фиксации билеты не снимает).
9. «Доказ (json)» скачать и **не публиковать**: в нём Telegram id всех участников. Хранить вместе с бэкапом volume `halloween_data`.

## Как удалить (после 01.11)

Тема и тыквы выключаются сами по дате, но код лучше убрать:

1. `docker compose ... rm -sf halloween`, сохранить `docker cp tgshop_v2_halloween:/data ./_backups/...` (если нужно), `docker volume rm <project>_halloween_data`. Удалить пользователя `DROP USER 'hw_ro'@'%';`.
2. Удалить `events/halloween/`, `docker-compose.halloween.yml`, `HW_*` из `.env`.
3. Удалить блоки `location /hw/` и `^~ /hw/(draw|api/admin)` из `infra/gateway.conf`, `gateway-site.conf`, `gateway-admin.conf`.
4. Сайт:
   - удалить `site/components/event/`, `site/app/[locale]/halloween-rules/`, `site/content/legal/*/halloween-rules.md`, `site/public/mascot-hw/`, `site/public/case-hw/`;
   - удалить `site/components/event/HwBannerSlide.tsx` и его слайд в `site/components/mascot/HeroBanner.tsx` (`hw`, `isHuntOn`);
   - убрать `halloweenRules` из `site/lib/legal.ts`;
   - убрать `HalloweenWidget`/`data-event` из `site/app/[locale]/layout.tsx` и `HalloweenCounter` из `site/components/layout/Header.tsx`;
   - убрать подмену `-hw` из `site/middleware.ts`;
   - убрать `batFlock` и `halloween`-ветку из `site/components/scene/SceneFx.tsx`.
5. Mini App: удалить `frontend/components/Halloween.tsx`, `frontend/components/halloween.css`, `frontend/middleware.ts`, `frontend/public/case-hw/`, убрать их использование в `frontend/app/layout.tsx` и `frontend/app/page.tsx` (`HalloweenCounter`, `HalloweenBanner`).
6. dev-прокси `/hw/` и `skipTrailingSlashRedirect` в `site/`, `frontend/`, `frontend-admin/next.config.ts` (вход без пароля `dev-login` можно оставить: он не про акцию).
7. Админка: пункт «Розыгрыш 🎃» и поле `external` в `frontend-admin/components/layout/Shell.tsx`.
8. Shared: `shared/src/event.ts`, `shared/src/event-assets.ts`, экспорт в `shared/src/index.ts` и `"./event"` в `shared/package.json`.

Проверка, что ничего не осталось: `git grep -n -i "halloween\|/hw/\|isHalloween\|-hw/"`.
