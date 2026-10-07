# TLS / HTTPS — как устроено и как продлевать

> Прод-сервер: `ubuntu@132.145.132.80` (сервер №1).
> Магазин: сайт `https://chisetup.com.ua`, Mini App `https://app.chisetup.com.ua`,
> админка `https://admin.chisetup.com.ua`. Старые адреса `maxsolkh.shop` (+ порты `:666`/`:667`)
> отвечают только **301-редиректом** на новые — их оставляют ради старых кнопок бота и закладок.

## TL;DR
- С **05.10.2026** порты 80/443 сервера держит **Caddy `edge_caddy`** (каталог `~/edge`) вместе с
  панелью **EdgeDeck** (`~/edgedeck`). Caddy сам выпускает и продлевает сертификаты всех сайтов на
  80/443, в том числе `chisetup.com.ua`, `www.`, `app.`, `admin.`. Руками ничего делать не надо.
  Хранилище сертификатов — docker-том `edge_caddy_data`: **никогда не удалять**.
- Единственный сертификат, который продлевает certbot по cron, — `maxsolkh.shop` для редиректов
  на портах `:666`/`:667` (контейнер `tgshop_v2_caddy`, `infra/Caddyfile.prod`). См. «Метод A».
- Проверка: `curl -I https://chisetup.com.ua` (ждём `200`), `curl -I https://maxsolkh.shop:666`
  (ждём `301` на `app.chisetup.com.ua`).

## Где что лежит (прод)
| Что | Путь |
|---|---|
| Магазин (compose) | `/home/ubuntu/TELEGRAM_BOTS/maxsolch-v2` |
| Edge Caddy (80/443) | `~/edge` (`sites/*.caddy`, `routes.yaml`; перечитать — `~/edge/bin/reload </dev/null`), подробности — `~/edge/README.md` |
| Сайты магазина на edge | `~/edge/sites/chisetup.com.ua.caddy`, `~/edge/sites/maxsolkh.shop.caddy` (301 + webroot certbot) |
| Caddy редиректов `:666`/`:667` | контейнер `tgshop_v2_caddy`, `infra/Caddyfile.prod`; cert через `.env` → `PROD_CERT_DIR` (`/home/ubuntu/edge-proxy/letsencrypt`) |
| Webroot для HTTP-01 certbot | `/home/ubuntu/edge-proxy/maxsolch-stub` |
| Бэкапы сертификатов | `~/BACKUPS/tls-certs-*.tar.gz` |

Старый nginx `edge_proxy` (`~/edge-proxy`) остановлен, но не удалён: откат на него —
`~/edge/bin/rollback-to-nginx` (`--back` возвращает Caddy).

> `~/edge/bin/reload` делает `docker compose exec` и съедает stdin — в `ssh 'bash -s' <<EOF`
> всё после него не выполнится; вызывать с `</dev/null`.

---

## Метод A — ТЕКУЩИЙ для `maxsolkh.shop:666/:667`: certbot HTTP-01 через edge_caddy
1. `edge_caddy` на :80 для `maxsolkh.shop` отдаёт `/.well-known/acme-challenge/*` из
   `/srv/certbot-webroot` (это примонтированный `~/edge-proxy/maxsolch-stub`); остальное — 301 на
   `chisetup.com.ua`. Свои ACME-токены Caddy перехватывает раньше маршрутов, конфликта нет.
2. Cert выпущен по webroot в `/home/ubuntu/edge-proxy/letsencrypt` (`authenticator = webroot`).
3. `tgshop_v2_caddy` читает его через `PROD_CERT_DIR` (монтируется `:ro` в `/certs`).
4. **Автопродление** — root-cron дважды в день:
   ```
   17 3,15 * * * /usr/local/bin/renew-maxsolkh-certs.sh >/dev/null 2>&1
   ```
   Скрипт гоняет `certbot renew --cert-name maxsolkh.shop --webroot` и **только при фактическом
   продлении** (сравнивает sha256 fullchain до/после) делает **`docker restart tgshop_v2_caddy`**.

   > ⚠️ Caddy с `tls <file>` **кэширует** сертификат, `caddy reload` файл с тем же путём **не
   > перечитывает** — только рестарт контейнера.

**Проверить продление без риска (LE staging, идёт несколько минут — certbot делает случайную паузу):**
```bash
sudo docker run --rm -v ~/edge-proxy/letsencrypt:/etc/letsencrypt \
  -v ~/edge-proxy/maxsolch-stub:/var/www/certbot \
  certbot/certbot renew --cert-name maxsolkh.shop --webroot -w /var/www/certbot --dry-run
```

**Перевыпустить вручную (боевой):**
```bash
docker run --rm -v /home/ubuntu/edge-proxy/letsencrypt:/etc/letsencrypt \
  -v /home/ubuntu/edge-proxy/maxsolch-stub:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d maxsolkh.shop --cert-name maxsolkh.shop --non-interactive --agree-tos
docker restart tgshop_v2_caddy   # НЕ reload
```

**Если challenge не проходит** — проверь, что файл отдаётся снаружи:
```bash
echo ok | sudo tee /home/ubuntu/edge-proxy/maxsolch-stub/.well-known/acme-challenge/t >/dev/null
curl http://maxsolkh.shop/.well-known/acme-challenge/t     # ждём: ok
sudo rm -f /home/ubuntu/edge-proxy/maxsolch-stub/.well-known/acme-challenge/t
```
Если не `ok` — проверь A-запись `maxsolkh.shop` и блок `http://maxsolkh.shop` в
`~/edge/sites/maxsolkh.shop.caddy`, затем `~/edge/bin/reload </dev/null`.

Когда редиректы со старого домена станут не нужны — `:666`/`:667`, `tgshop_v2_caddy`, cron и
certbot можно убрать целиком.

---

## Метод B — РЕЗЕРВНЫЙ: ручной DNS-01 (когда :80 недоступен)
Подходит для сервера, где 80/443 заняты и нет webroot-фронта. Требует доступ к DNS домена.

```bash
mkdir -p ~/certs-maxsolkh && cd ~/certs-maxsolkh
sudo certbot certonly --manual --preferred-challenges dns \
  --config-dir "$(pwd)/letsencrypt" \
  --work-dir  "$(pwd)/letsencrypt/work" \
  --logs-dir  "$(pwd)/letsencrypt/logs" \
  -d maxsolkh.shop
```
1. certbot покажет: `_acme-challenge.maxsolkh.shop  TXT  <значение>`.
2. Добавь TXT-запись в DNS домена.
3. Дождись видимости: `dig +short TXT _acme-challenge.maxsolkh.shop @1.1.1.1`.
4. Нажми Enter → cert появится в `~/certs-maxsolkh/letsencrypt/live/maxsolkh.shop/`.
5. В `~/TELEGRAM_BOTS/maxsolch-v2/.env` поставь
   `PROD_CERT_DIR=/home/ubuntu/certs-maxsolkh/letsencrypt` и пересоздай Caddy (ниже).

⚠️ `--manual` DNS-01 **не автопродляется** — повторять каждые ~60–90 дней.

---

## Пересоздать Caddy редиректов (после смены PROD_CERT_DIR)
```bash
cd ~/TELEGRAM_BOTS/maxsolch-v2
docker compose -f docker-compose.yml -f docker-compose.public.yml -f docker-compose.prod.yml up -d --no-build caddy
curl -I https://maxsolkh.shop:666
echo | openssl s_client -connect maxsolkh.shop:666 -servername maxsolkh.shop 2>/dev/null | openssl x509 -noout -dates
```

## Бэкап / восстановление сертификата certbot
```bash
TS=$(date +%F-%H%M)
sudo tar czf ~/BACKUPS/tls-certs-$TS.tar.gz -C / home/ubuntu/edge-proxy/letsencrypt
# восстановить:
sudo tar xzf ~/BACKUPS/tls-certs-<TS>.tar.gz -C / && docker restart tgshop_v2_caddy
```
Сертификаты `edge_caddy` живут в томе `edge_caddy_data`; при переносе сервера Caddy выпустит их
заново сам, как только A-записи укажут на новый IP и откроются 80/443.

## Перенос магазина на другой сервер
- A-записи `chisetup.com.ua`, `www`, `app`, `admin` → новый IP; на новом сервере edge-Caddy с теми
  же `sites/*.caddy` — сертификаты выпустятся сами.
- Если старые редиректы ещё нужны — перенести `tgshop_v2_caddy`, cert `maxsolkh.shop` (Метод A
  или B), открыть 666/667 (ufw + firewall облака), выставить `PROD_CERT_DIR`.
