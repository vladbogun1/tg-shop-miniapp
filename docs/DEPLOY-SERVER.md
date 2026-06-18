# Деплой Maxsolch 2.0 на прод-сервер — план + runbook

> Сервер: `ubuntu@132.145.132.80` (Oracle Cloud, Ubuntu 22.04, 4 CPU / 23 Gi RAM).
> Подключение: `ssh -i C:/Users/nikto/oracleserver.key ubuntu@132.145.132.80`
> Домен: **`maxsolkh.shop`** (A-запись → 132.145.132.80, подтверждено).
>
> **Статус: ПЛАН. Деплой ещё не выполнялся.** Сделаны только безопасные действия:
> read-only аудит и бэкапы.

---

## 1. Что сейчас на сервере (аудит 2026-06-18)

### Стек старого магазина — compose-проект `maxsolch-mini-app`
Каталог: `/home/ubuntu/TELEGRAM_BOTS/maxsolch-mini-app/`

| Контейнер | Образ | Порт (host) | Роль |
|---|---|---|---|
| `tgshop-app` | `vladbogun1/tg-shop-miniapp:latest` | — (8080 внутр.) | Java-бэкенд старого магазина |
| `tgshop-proxy` | `caddy:2.8` | `8443→443` | TLS-прокси, домен `maxsolkh.shop:8443` |
| `tgshop-db` | `mysql:8.4` (healthy) | — (3306 внутр.) | **БД `tg_test` — НЕ ТУШИТЬ, нужна для миграции** |

- Старый бот: `@ChiSetupShop_bot` (long-polling, без webhook).
- Публичный URL старого Mini App: `https://maxsolkh.shop:8443`.
- Caddyfile: `reverse_proxy app:8080` + TLS из `caddy/letsencrypt/live/maxsolkh.shop/`.

### Другие проекты на сервере (НЕ ТРОГАТЬ)
portainer (8000/9443/8082), majestic-report-bot (8087) + db (3340), prado-bot (8088) + db (3320),
snikket (turnserver, 5222/5269/5349/8448…), pufferpanel (5657/8080), TShock (7777),
telegram-maxsolch-invite-bot (8077), хостовый **nginx на 80/443**.

### Занятые host-порты
`22, 80, 88(нет), 111, 443, 631, 3320, 3340, 5657, 5765, 7777, 8000, 8077, 8080, 8082, 8087, 8088, 8443, 9443` + turnserver-диапазоны.
**Порты 666 / 667 / 668 — СВОБОДНЫ** ✅ (и в системе, и в Docker).

### ⚠️ Важные ограничения
- **Диск: 96 % занято, свободно ~4.2 G.** Перед деплоем освободить место
  (`docker image prune`, удалить exited-контейнеры windrose/mineflayer/reverse-proxy/
  web-server/Adminer/mysql-db). Иначе сборка фронтов/пул образов может упасть.
- **Host-порты 80 и 443 заняты** (nginx) → v2 не может слушать 443 напрямую,
  TLS-порт будет нестандартным (как у старого: 8443; у нас — 666/667).
- **Oracle Cloud VCN Security List**: помимо `ufw` ingress режется ещё и на уровне
  облака. Для новых портов нужно добавить ingress-правило в VCN (консоль Oracle),
  иначе снаружи порт будет закрыт даже при открытом ufw.

---

## 2. Бэкапы (✅ сделаны, read-only, прод не затронут)

На сервере: `/home/ubuntu/BACKUPS/maxsolch-20260618-072141/`
- `tg_test-*.sql.gz` — полный дамп БД (122 MB, `--single-transaction`, живая БД не останавливалась);
- `docker-compose.yaml`, `env.backup`, `Caddyfile`, `docker-ps.txt`.

Локальная копия дампа: `safety-backups/server/tg_test-20260618-072141.sql.gz` (gzip проверен).

---

## 3. Как погасить СТАРОЕ приложение, НЕ туша БД

```bash
cd /home/ubuntu/TELEGRAM_BOTS/maxsolch-mini-app
docker compose stop app proxy        # гасим бэкенд + Caddy, БД (db) остаётся жить
docker compose ps                    # убедиться: db = Up, app/proxy = Exited
```
> `stop` (а не `down`) сохраняет контейнеры и тома → мгновенный откат `docker compose start app proxy`.
> Старый и новый боты **разные** (`@ChiSetupShop_bot` vs `@maxsolch_bot`), поэтому v2
> можно поднять и протестировать ПАРАЛЛЕЛЬНО, не гася старый. Гасить старый — только
> когда v2 подтверждён.

---

## 4. Целевая раскладка портов v2

v2 = single-origin gateway'и (см. `docker-compose.public.yml`): `gateway` (клиент) и
`gateway-admin` (админка) — это nginx на :80 внутри. Сверху ставим Caddy для TLS,
переиспользуя сертификат `maxsolkh.shop`.

| Порт (host) | Назначение | URL |
|---|---|---|
| **666** | Клиентский Mini App (gateway: фронт + `/api` + `/ws` + `/img`) | `https://maxsolkh.shop:666` |
| **667** | Админка (gateway-admin) | `https://maxsolkh.shop:667` |
| **668** | Резерв (напр. MinIO-консоль для отладки; по умолчанию не публикуем наружу) | — |

`WEBAPP_BASE_URL=https://maxsolkh.shop:666`, `ADMIN_BASE_URL=https://maxsolkh.shop:667`.

> **Telegram + нестандартный порт:** бот v2 на long-polling (webhook не нужен → ограничение
> Telegram «443/80/88/8443» к нам НЕ применяется). Mini App открывается во встроенном
> браузере по любому валидному HTTPS-URL — старый магазин это уже доказал на :8443.
> Если Telegram всё же закапризничает на :666 — после вывода старого магазина из эксплуатации
> переключить v2 на проверенный `:8443` (освободится от старого Caddy).

### Сертификат
Сертификат `maxsolkh.shop` уже выпущен (Let's Encrypt, в старом
`maxsolch-mini-app/caddy/letsencrypt/live/maxsolkh.shop/`). Caddy v2 монтирует эти же
файлы read-only (см. `infra/Caddyfile.prod` и `docker-compose.prod.yml`). Авто-ACME для
v2 невозможен (порты 80/443 заняты), поэтому переиспользуем существующий cert; продление —
снап-таймер `certbot.renew` (активен) + старый Caddy. Альтернатива: DNS-01 challenge.

---

## 5. Порядок деплоя v2 (когда подтвердим план)

```bash
# 0. Освободить место на диске
docker container prune -f && docker image prune -af

# 1. Залить код v2 на сервер (git clone ветки v2 или scp), напр. в:
#    /home/ubuntu/TELEGRAM_BOTS/maxsolch-v2/
git clone -b v2 https://github.com/vladbogun1/tg-shop-miniapp.git maxsolch-v2
cd maxsolch-v2/tg-shop-v2

# 2. .env (прод): домены, секреты, ALLOW_UNSIGNED_INIT_DATA=false, сильные пароли,
#    BOT_TOKEN=@maxsolch_bot, подписанные imgproxy ключи.

# 3. Поднять внутренний стек + публичные gateway'и + Caddy (порты 666/667)
docker compose up -d                                  # mysql/minio/imgproxy/nginx/backend
docker compose -f docker-compose.yml -f docker-compose.public.yml \
               -f docker-compose.prod.yml up -d --build \
               frontend-public gateway frontend-admin-public gateway-admin caddy

# 4. Миграция данных (БД старого магазина tgshop-db должна быть Up):
#    дамп tg_test → прогнать migration-тулзу против нового tgshop_v2 (см. migration/README.md).
#    Тулза сама накатывает бэкфилл статус-таймстампов и причин отказа.

# 5. ufw + Oracle VCN
sudo ufw allow 666/tcp && sudo ufw allow 667/tcp       # 668 — только если публикуем
#    + ingress-правило 666-667/tcp в Oracle VCN Security List (консоль Oracle).

# 6. BotFather (@maxsolch_bot): Menu Button URL = https://maxsolkh.shop:666 ;
#    /setdomain (для login widget, если используется) = maxsolkh.shop.

# 7. Проверить: https://maxsolkh.shop:666 (клиент), https://maxsolkh.shop:667 (админ),
#    открыть Mini App из @maxsolch_bot, оформить тестовый заказ, чат, метрики.
```

### Тег Docker-образа (важно!)
- master уже собрался и опубликовал `:latest` → **для первого деплоя НЕ используем `:latest`**,
  берём конкретный версионный тег (напр. `:v2.0.0` / SHA), чтобы не подтянуть «сырой» latest.
- После успешной проверки — переключить на `:latest`.
- ⚠️ Текущий `ci.yml` образы в реестр **не пушит** (только тест+сборка). Перед деплоем
  по тегам нужно либо добавить publish-job в CI, либо собирать образы локально/на сервере
  (`--build`). Решить до деплоя.

---

## 6. Runbook (эксплуатация v2)

```bash
cd /home/ubuntu/TELEGRAM_BOTS/maxsolch-v2/tg-shop-v2

# статус / логи
docker compose ps
docker compose logs -f backend
docker compose logs -f caddy

# обновление кода
git pull origin v2
docker compose -f docker-compose.yml -f docker-compose.public.yml -f docker-compose.prod.yml \
               up -d --build

# рестарт одного сервиса
docker compose restart backend

# бэкап БД v2 (cron-friendly)
docker exec tgshop_v2_mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction tgshop_v2' | gzip > ~/BACKUPS/tgshop_v2-$(date +%F).sql.gz

# ОТКАТ к старому магазину
cd /home/ubuntu/TELEGRAM_BOTS/maxsolch-mini-app && docker compose start app proxy
cd /home/ubuntu/TELEGRAM_BOTS/maxsolch-v2/tg-shop-v2 && docker compose down   # снять v2
```

---

## 7. Открытые вопросы (решить перед деплоем)
1. **Порты Mini App**: 666/667 (как просил) или сразу 8443 (после вывода старого)? → план готов под 666/667.
2. **Образы**: добавить publish в CI и деплой по тегам, или `--build` на сервере? (диск 4.2G — сборка рискованна).
3. **Сертификат**: переиспользовать старый cert-файл (просто) или выпустить отдельный для поддомена через DNS-01?
