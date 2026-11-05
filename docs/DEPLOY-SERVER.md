# Деплой и эксплуатация на прод-сервере

> Сервер №1: `$PROD_HOST` (Oracle Cloud, Ubuntu 22.04, **ARM64**, 4 CPU / 23 Gi RAM).
> Адреса серверов, ssh-пользователь и путь к ключу — во внутренней базе знаний владельца, вне репозитория (в git-истории старые значения остаются).
> Каталог проекта: `/home/ubuntu/TELEGRAM_BOTS/maxsolch-v2` (compose-проект `maxsolch-v2`).
> Демо-стенд для экспериментов — отдельный сервер №3 (`demo.chisetup.com.ua`, `app.demo.`,
> `admin.demo.`), его оверлей и `demo.sh` в репозиторий не входят.

## 1. Как устроено сейчас

| Адрес | Что | Внутри |
|---|---|---|
| `https://chisetup.com.ua` (+ `www`) | сайт | `gateway-site` → `site-public` + `/api` бэкенда |
| `https://app.chisetup.com.ua` | Telegram Mini App | `gateway` → `frontend-public` + `/api`, `/ws`, `/img` |
| `https://admin.chisetup.com.ua` | админка (PWA) | `gateway-admin` → `frontend-admin-public` + `/api`, `/ws` |
| `maxsolkh.shop`, `:666`, `:667` | старые адреса | только 301 на новые (кнопки старых сообщений бота, закладки) |

- **80/443 с 05.10.2026** держит **Caddy `edge_caddy`** (`~/edge`) с панелью **EdgeDeck**:
  TLS для всех сайтов выпускается и продлевается автоматически. Gateway'и магазина опубликованы
  только на `127.0.0.1:8090/8091/8092`; наружу их отдаёт edge Caddy (`~/edge/sites/chisetup.com.ua.caddy`).
- Старый `maxsolkh.shop:666/:667` — контейнер `tgshop_v2_caddy` (`infra/Caddyfile.prod`) на
  сертификате certbot; продление — [`TLS-RENEWAL.md`](TLS-RENEWAL.md).
- Бот — `@ChiSetupShop_bot` (long-polling). Кнопка меню ведёт на `app.chisetup.com.ua`
  (ставится через `setChatMenuButton`, бэкенд её сам не меняет).
- Оплата — **monobank-эквайринг** (с v3.9.0): `MONOBANK_TOKEN` только в `.env` сервера, чеки
  ПРРО — Вчасно.Каса через monobank (настройка «Оплата и чеки» → коды ставок). Подробно —
  [`MONOBANK-ACQUIRING.md`](MONOBANK-ACQUIRING.md).
- Вход в админку — пароль + обязательная 2FA (TOTP), `ADMIN_2FA_KEY` в `.env` **не менять**
  (иначе секреты 2FA не расшифровать). См. [`ADMIN-2FA.md`](ADMIN-2FA.md).
- Образы собирает CI (`.github/workflows/publish.yml`, теги `v2.*`/`v3.*`) под arm64 и пушит в
  Docker Hub: `vladbogun1/maxsolch2-{backend,frontend,admin,site}`. Сервер только тянет.
- Репозиторий **публичный**: пароли, токены, реквизиты в git не писать — только в `.env` сервера.

### Релиз (как выкатываются v3.x)
1. Влить в `master`, поставить тег `v3.N.M` → CI соберёт и запушит образы.
2. На сервере: дамп БД и копия `.env` в `~/BACKUPS/maxsolch-pre-v3.N.M-<дата>/`.
3. `IMAGE_TAG=v3.N.M` в `.env`, `git pull` (конфиги/compose), затем `pull` и
   `up -d --no-build` (команды ниже). Миграции Flyway бэкенд накатывает сам при старте.
4. Откат — `infra/rollback.sh <предыдущий тег>`; генерировать `rollback.sh` руками больше не нужно
   (старые серверные `rollback.sh.<от>-to-<к>` можно удалить).

### Сервер: грабли
- Oracle Cloud режет ingress ещё и в VCN Security List — новый порт открывать и в ufw, и в консоли.
- Host-порты `8080` и `8082` заняты другими проектами → `backend` и `nginx`-кэш internal-only
  (`ports: !override []` в `docker-compose.prod.yml`).
- Другие проекты на сервере (portainer, боты, panel'и) — не трогать.

## 2. Runbook

```bash
cd /home/ubuntu/TELEGRAM_BOTS/maxsolch-v2

# статус / логи
docker compose ps
docker compose logs -f backend
docker compose logs -f caddy

# обновление: см. «Релиз» выше; вручную — сменить IMAGE_TAG в .env, затем
C="-f docker-compose.yml -f docker-compose.public.yml -f docker-compose.prod.yml"
# Тянем только НАШИ образы. minio/minio и minio/mc больше не публикуются (ни Docker Hub, ни quay.io):
# у них в compose стоит pull_policy: missing, и они берутся из уже скачанного на сервере образа.
# Голый `docker compose $C pull` на них упадёт — не запускать его без списка сервисов.
git pull \
  && docker compose $C pull backend cutout frontend-public frontend-admin-public site-public \
  && docker compose $C up -d --no-build mysql minio imgproxy cutout nginx backend \
       frontend-public gateway frontend-admin-public gateway-admin site-public gateway-site caddy
# Список сервисов ОБЯЗАТЕЛЕН: в базовом compose есть dev-сервисы (frontend, frontend-admin, site, minio-init),
# голый `up -d` запустил бы их. backend теперь имеет healthcheck: `docker compose ps` покажет (healthy)
# после миграций; gateway'и ждут его при старте.

# рестарт одного сервиса
docker compose restart backend

# после смены IMGPROXY_ALLOWED_SOURCES (теперь только s3://<bucket>/products/) — пересоздать
# imgproxy и сбросить кэш картинок nginx, иначе уже закэшированные /img/... (в т.ч. из chat/)
# отдаются ещё до 30 дней
docker compose $C up -d imgproxy
docker exec tgshop_v2_nginx sh -c 'rm -rf /var/cache/nginx/img/*' && docker compose restart nginx

# бэкап БД: infra/backup.sh (с ротацией; расписание — §5)
infra/backup.sh

# ОТКАТ релиза: infra/rollback.sh <тег> (лежит в репозитории; снимает дамп, возвращает IMAGE_TAG и
# конфиги тега, ждёт healthy backend; что именно делает — в его шапке). Миграции Flyway назад не откатываются — для этого дамп.
# ⚠️ V48 (чистка 2026-10) — точка невозврата: она дропает колонки и таблицы старой оплаты на карту,
# а бэкенд v3.10.0 и ниже валидирует схему (order_messages.width/height) и на ней не стартует.
# Откат за V48 — только восстановлением дампа, снятого до релиза.
```

### Push-уведомления админки (PWA, VAPID)

Админка (https://admin.chisetup.com.ua) ставится на телефон как приложение и шлёт push о новом заказе,
оплате, сообщении клиента и сбое ревалидации сайта. Без ключей push просто выключен.

```bash
# один раз сгенерировать пару (команды — в .env.example, блок VAPID_*), вписать в .env на сервере:
#   VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  VAPID_SUBJECT=mailto:<почта владельца>
docker compose $C up -d --no-build backend      # подхватить ключи
docker compose logs backend | grep "Web Push"   # «Admin Web Push is on»
```

Ключи не менять без нужды: при смене все устройства надо заново включить в «Настройки → Приложение и
уведомления» (старые подписки push-сервисы отклонят, бэкенд их удалит сам). Таблица подписок —
`admin_push_subscriptions` (V34). Бэкенду нужен исходящий HTTPS к fcm.googleapis.com,
web.push.apple.com, updates.push.services.mozilla.com.

### MinIO: образов больше нет в реестрах

`minio/minio` и `minio/mc` (и `quay.io/minio/*`) больше не публикуются, поэтому в compose у них
`pull_policy: missing` — используется образ, уже лежащий на сервере. **Не удаляйте его**
(`docker image prune -a` удалит неиспользуемый `minio/mc` — он нужен только при `up` minio-init).
Чтобы не зависеть от локального кэша:

0. С этого релиза в compose образы закреплены по digest (`minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:…`,
   `minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:…`): ровно те, что стоят на сервере. Образа **нет в реестрах**,
   поэтому при потере с диска новый `pull` не поможет — сделайте п. 1 (копия в свой Docker Hub) **один раз**.
1. **Закрепить образ у себя:** `docker save minio/minio minio/mc | gzip > ~/BACKUPS/minio-images.tar.gz`
   (восстановить — `docker load < ...`), либо `docker tag` + `docker push` в свой Docker Hub
   (`<DOCKERHUB_USERNAME>/minio:<дата>`) и прописать этот тег в `image:` (лучше по digest, не `latest`).
2. **Зеркало/замена:** собрать MinIO из исходников (AGPL, github.com/minio/minio) или перейти на
   другое S3-совместимое хранилище (SeaweedFS, Garage и т.п.) — backend и imgproxy нужен только S3 API.

---

---

## 3. История: первый деплой v2 (июнь 2026)

18.06.2026 v2 заменила старый магазин `tg-shop-miniapp` на том же сервере: тогда 80/443 держал
хостовый nginx, поэтому v2 жила на `https://maxsolkh.shop:666` (клиент) / `:667` (админка) за
своим Caddy, данные старой БД (`tg_test`) перенесла одноразовая тулза `migration/` (товары,
заказы, чат, картинки в MinIO). Бэкап старой БД — `~/BACKUPS/maxsolch-20260618-072141/`.

С тех пор: модуль `migration/` удалён из репозитория (перенос давно выполнен), магазин переехал на
`chisetup.com.ua` (v3.1.0, 05.10.2026), прокси 80/443 — на edge Caddy + EdgeDeck. Подробности
того деплоя — в истории git этого файла и в `docs/archive/HANDOFF.md`.

---

## 4. Лимиты ресурсов и проверка здоровья (с релиза, где появился этот раздел)

Сервер общий (11,9 ГБ RAM, 4,1 ГБ «available», подкачка уже ~2 ГБ используется), поэтому в
`docker-compose.prod.yml` у каждого сервиса магазина есть `mem_limit`, а у JVM —
`-XX:MaxRAMPercentage=65 -XX:+ExitOnOutOfMemoryError`. Лимиты ≈ 2× от того, что контейнер ест в покое
(замер `docker stats` 01.11.2026):

| сервис | в покое | `mem_limit` |
|---|---|---|
| backend | 780 МБ | 1536 МБ (куча ≈ 1 ГБ) |
| mysql | 575 МБ | 1536 МБ |
| imgproxy | 57 МБ | 768 МБ (всплески при ресайзе больших фото) |
| cutout (вырезка товара для «фото по ссылке») | ~360 МБ, после вырезки ~700 МБ | 2 ГБ (пик ~1,3 ГБ на фото, режет по одному) |
| minio | 152 МБ | 512 МБ |
| frontend-public / frontend-admin-public / site-public | 53 / 68 / 228 МБ | 512 МБ |
| gateway ×3, nginx, caddy | < 50 МБ | 128 МБ |

Если контейнер упёрся в лимит, Docker его убьёт и поднимет заново (`restart: unless-stopped`):
смотрите `docker inspect <имя> --format '{{.State.OOMKilled}}'` и поднимайте лимит в оверлее, а не руками.
Логи ограничены (`json-file`, 10 МБ × 3 на контейнер; то же задано в `/etc/docker/daemon.json`).

`backend` — healthcheck `GET /actuator/health` (порт управления совпадает с портом приложения, 8080;
наружу actuator закрыт gateway'ями). Зависший backend получает статус `unhealthy` — это видно в
`docker compose ps`, Portainer и Dozzle. Сам по себе Docker unhealthy-контейнер **не перезапускает**:
статус нужен для зависимостей (`service_healthy`) и для глаз.
Backend теперь работает не от root (uid 10001); томов у него нет, писать на диск ему нечего.

## 5. Бэкап и восстановление БД

`infra/backup.sh` — дамп `mysqldump --single-transaction` в `~/BACKUPS/db/<база>-<дата>.sql.gz`:
проверяет, что архив целый и дамп дописан, хранит 14 дней ежедневных и 12 недель воскресных,
по желанию (`OFFSITE_TARGET=user@host:/путь/`) копирует каталог rsync'ом на другой сервер.
Пароль в файле не лежит: имя базы берётся из `.env`, пароль root — из окружения контейнера MySQL.

**Cron (настроить один раз, под пользователем `ubuntu`; `crontab -e`):**

```cron
# дамп БД магазина каждую ночь в 03:30 по времени сервера
30 3 * * * cd /home/ubuntu/TELEGRAM_BOTS/maxsolch-v2 && infra/backup.sh >> ~/BACKUPS/db-backup.log 2>&1
```

Бэкап лежит на том же диске, что и база: от потери сервера он не спасает. Задайте `OFFSITE_TARGET`
(например, на сервер №2, где уже есть restic-репозиторий) — строка в cron тогда:
`30 3 * * * cd … && OFFSITE_TARGET=user@host:/путь/ infra/backup.sh …`. Раз в месяц проверяйте, что
свежий файл не пустой и разворачивается (команда ниже на копии, не на проде).

**Восстановление** (останавливает магазин на время заливки):

```bash
cd /home/ubuntu/TELEGRAM_BOTS/maxsolch-v2
C="-f docker-compose.yml -f docker-compose.public.yml -f docker-compose.prod.yml"
docker compose $C stop backend site-public
zcat ~/BACKUPS/db/<файл>.sql.gz | docker exec -i tgshop_v2_mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE"'
docker compose $C up -d --no-build backend site-public
```

## 6. Первый релиз после этих правок — что сделает владелец

1. **До выкатки:** `docker save minio/minio minio/mc | gzip > ~/BACKUPS/minio-images.tar.gz` и (лучше) залить
   образы в свой Docker Hub — см. «MinIO: образов больше нет в реестрах».
2. Дамп БД и копия `.env` как обычно. `git pull` (или checkout тега) — подтянутся новые compose и `infra/*.sh`.
3. Выкатка командой из §2 **со списком сервисов**. Изменится: контейнеры mysql, minio, imgproxy, nginx,
   gateway'и **пересоздадутся** (новые лимиты памяти и закреплённые образы; digest совпадает с текущим,
   данные в томах остаются) — 5–20 секунд без сайта. backend запустится на новой JVM-настройке и под
   пользователем `app`; `docker compose ps` должен показать `backend (healthy)` в течение ~2 минут.
4. Проверить: `docker stats --no-stream` (память ниже лимитов), `docker inspect tgshop_v2_backend --format '{{.State.Health.Status}}'`,
   сайт, Mini App, загрузка фото в админке (backend теперь не root, MinIO по сети — должно работать).
5. Руками, один раз: cron из §5 (и off-site), копия образа MinIO (п. 1), `chmod +x infra/*.sh` не нужен
   (права в git), старые `rollback.sh*` в каталоге проекта можно убрать.
6. Если что-то не так — `infra/rollback.sh <прежний тег>`.
