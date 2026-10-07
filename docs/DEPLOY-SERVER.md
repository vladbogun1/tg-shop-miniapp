# Деплой и эксплуатация на прод-сервере

> Сервер №1: `ubuntu@132.145.132.80` (Oracle Cloud, Ubuntu 22.04, **ARM64**, 4 CPU / 23 Gi RAM).
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
4. Обновить `rollback.sh` на предыдущий тег (старый сохраняется как `rollback.sh.<от>-to-<к>`).

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
  && docker compose $C pull backend frontend-public frontend-admin-public site-public \
  && docker compose $C up -d --no-build

# рестарт одного сервиса
docker compose restart backend

# после смены IMGPROXY_ALLOWED_SOURCES (теперь только s3://<bucket>/products/) — пересоздать
# imgproxy и сбросить кэш картинок nginx, иначе уже закэшированные /img/... (в т.ч. из chat/)
# отдаются ещё до 30 дней
docker compose $C up -d imgproxy
docker exec tgshop_v2_nginx sh -c 'rm -rf /var/cache/nginx/img/*' && docker compose restart nginx

# бэкап БД (cron-friendly)
docker exec tgshop_v2_mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction tgshop_v2' | gzip > ~/BACKUPS/tgshop_v2-$(date +%F).sql.gz

# ОТКАТ релиза: ./rollback.sh в каталоге проекта (возвращает предыдущий IMAGE_TAG;
# что именно он делает — в его шапке). Миграции Flyway назад не откатываются — для этого дамп.
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
