# TLS / HTTPS для maxsolkh.shop — как устроено и как продлевать

> Прод-сервер: `ubuntu@132.145.132.80` (SSH-ключ `C:/Users/nikto/oracleserver.key`).
> Магазин: `https://maxsolkh.shop:666` (клиент) / `:667` (админка).
> TLS терминирует **Caddy** (`tgshop_v2_caddy`) на нестандартных портах, потому что 80/443
> на сервере заняты контейнером `edge_proxy` (nginx) для других сайтов.

## TL;DR
- Сертификат Let's Encrypt, **продлевается автоматически** (Метод A, HTTP-01 через edge_proxy).
- Пока работает — трогать не надо. Проверка: `curl -I https://maxsolkh.shop:666` (ждём `200`).
- Резервный/переносной способ, когда нет edge_proxy — **Метод B** (ручной DNS-01).

## Где что лежит (прод)
| Что | Путь |
|---|---|
| Магазин (compose) | `/home/ubuntu/TELEGRAM_BOTS/maxsolch-v2` |
| Caddy читает cert | `.env` → `PROD_CERT_DIR` (сейчас `/home/ubuntu/edge-proxy/letsencrypt`), Caddyfile `infra/Caddyfile.prod` (`tls /certs/live/maxsolkh.shop/{fullchain,privkey}.pem`) |
| edge_proxy (nginx, :80/:443) | `/home/ubuntu/edge-proxy` (`nginx.conf`, `letsencrypt/`, `maxsolch-stub/`) |
| Cert-хранилище (активное) | `/home/ubuntu/edge-proxy/letsencrypt/live/maxsolkh.shop/` |
| Бэкапы сертификатов | `~/BACKUPS/tls-certs-*.tar.gz` |

---

## Метод A — ТЕКУЩИЙ: автоматический HTTP-01 через edge_proxy
Работает, когда домен `maxsolkh.shop` (A-запись) приходит на этот сервер **и** порт 80 обслуживает
`edge_proxy`, который отдаёт ACME-challenge.

**Как устроено**
1. `edge_proxy` nginx на :80 для `maxsolkh.shop` проксирует `/.well-known/acme-challenge/`
   в контейнер `maxsolch_stub` (webroot `/home/ubuntu/edge-proxy/maxsolch-stub`). Блок в
   `/home/ubuntu/edge-proxy/nginx.conf`:
   ```nginx
   server {
       listen 80;
       server_name maxsolkh.shop www.maxsolkh.shop;
       location /.well-known/acme-challenge/ { proxy_pass http://maxsolch_stub:80; }
       location / { return 404; }
   }
   ```
2. Cert выпущен по webroot в `/home/ubuntu/edge-proxy/letsencrypt` (`authenticator = webroot`).
3. Caddy читает его через `PROD_CERT_DIR=/home/ubuntu/edge-proxy/letsencrypt`.
4. **Автопродление** — root-cron дважды в день; после продления релоадит и nginx, и Caddy:
   ```
   17 3,15 * * * docker run --rm \
     -v /home/ubuntu/edge-proxy/letsencrypt:/etc/letsencrypt \
     -v /home/ubuntu/edge-proxy/maxsolch-stub:/var/www/certbot \
     certbot/certbot renew --webroot -w /var/www/certbot --quiet \
     && docker exec edge_proxy nginx -s reload \
     && docker exec tgshop_v2_caddy caddy reload --config /etc/caddy/Caddyfile
   ```

**Проверить продление без риска (LE staging):**
```bash
docker run --rm -v /home/ubuntu/edge-proxy/letsencrypt:/etc/letsencrypt \
  -v /home/ubuntu/edge-proxy/maxsolch-stub:/var/www/certbot \
  certbot/certbot renew --webroot -w /var/www/certbot --cert-name maxsolkh.shop --dry-run
```

**Перевыпустить вручную (боевой):**
```bash
docker run --rm -v /home/ubuntu/edge-proxy/letsencrypt:/etc/letsencrypt \
  -v /home/ubuntu/edge-proxy/maxsolch-stub:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d maxsolkh.shop --cert-name maxsolkh.shop --non-interactive --agree-tos
docker exec tgshop_v2_caddy caddy reload --config /etc/caddy/Caddyfile
```

**Если challenge не проходит** — проверь, что файл отдаётся снаружи:
```bash
echo ok | sudo tee /home/ubuntu/edge-proxy/maxsolch-stub/.well-known/acme-challenge/t >/dev/null
curl http://maxsolkh.shop/.well-known/acme-challenge/t     # ждём: ok
sudo rm -f /home/ubuntu/edge-proxy/maxsolch-stub/.well-known/acme-challenge/t
```
Если не `ok` — проверь A-запись домена (→ IP сервера), наличие nginx-блока выше и
`docker exec edge_proxy nginx -t && docker exec edge_proxy nginx -s reload`.

---

## Метод B — РЕЗЕРВНЫЙ: ручной DNS-01 (когда НЕТ edge_proxy / :80 недоступен)
Подходит для нового сервера, где 80/443 заняты и нет webroot-фронта. Требует доступ к DNS домена.
Это исходный способ (см. старый файл `maxsolch-mini-app/CERTIFICAT`).

```bash
mkdir -p ~/certs-maxsolkh && cd ~/certs-maxsolkh
sudo certbot certonly --manual --preferred-challenges dns \
  --config-dir "$(pwd)/letsencrypt" \
  --work-dir  "$(pwd)/letsencrypt/work" \
  --logs-dir  "$(pwd)/letsencrypt/logs" \
  -d maxsolkh.shop
```
1. certbot покажет: `_acme-challenge.maxsolkh.shop  TXT  <значение>`.
2. Добавь TXT-запись в DNS (Hostinger → hPanel → DNS Zone Editor): имя `_acme-challenge`, тип TXT, значение из вывода.
3. Дождись видимости: `dig +short TXT _acme-challenge.maxsolkh.shop @1.1.1.1` — должно показать значение.
4. Нажми Enter → cert появится в `~/certs-maxsolkh/letsencrypt/live/maxsolkh.shop/`.
5. Направь Caddy на него: в `~/TELEGRAM_BOTS/maxsolch-v2/.env` поставь
   `PROD_CERT_DIR=/home/ubuntu/certs-maxsolkh/letsencrypt`, затем пересоздай Caddy (см. ниже).

⚠️ Минус: **не автопродляется** (`--manual` DNS-01). Повторять каждые ~60–90 дней вручную.
Полностью автоматический DNS-01 возможен только у DNS-провайдера с API (напр. Cloudflare) +
`certbot-dns-<provider>` плагин. У Hostinger публичного API для редактирования зоны нет.

---

## Пересоздать Caddy (после смены PROD_CERT_DIR)
```bash
cd ~/TELEGRAM_BOTS/maxsolch-v2
docker compose -f docker-compose.yml -f docker-compose.public.yml -f docker-compose.prod.yml up -d --no-build caddy
# проверка:
curl -I https://maxsolkh.shop:666
echo | openssl s_client -connect maxsolkh.shop:666 -servername maxsolkh.shop 2>/dev/null | openssl x509 -noout -dates
```

## Бэкап / восстановление сертификатов
**Бэкап (делать перед любыми изменениями):**
```bash
TS=$(date +%F-%H%M)
sudo tar czf ~/BACKUPS/tls-certs-$TS.tar.gz -C / \
  home/ubuntu/edge-proxy/letsencrypt \
  home/ubuntu/TELEGRAM_BOTS/maxsolch-mini-app/caddy/letsencrypt 2>/dev/null
```
**Восстановить из бэкапа:**
```bash
sudo tar xzf ~/BACKUPS/tls-certs-<TS>.tar.gz -C /
docker restart tgshop_v2_caddy
```

## Откат с Метода A (быстрый возврат, если автоспособ сломался)
1. Распакуй последний бэкап (см. выше) — вернёт и старый cert-каталог.
2. Верни `PROD_CERT_DIR` на старый каталог (если нужно):
   `PROD_CERT_DIR=/home/ubuntu/TELEGRAM_BOTS/maxsolch-mini-app/caddy/letsencrypt` в `.env`.
3. Пересоздай Caddy (команда выше).
4. Если cert протух — перевыпусти по Методу B (ручной DNS-01).

## Перенос магазина на другой сервер
- **Порт 80 домена свободен/приходит на сервер** → подними лёгкий nginx (аналог `edge_proxy`)
  с acme-challenge webroot + cron из Метода A. Самый надёжный автоспособ.
- **80/443 заняты и фронта нет** → временно Метод B (ручной DNS-01); для автоматизации
  перенеси DNS на Cloudflare (бесплатно, есть API) и настрой `certbot-dns-cloudflare`.
- Не забыть: A-запись домена → новый IP; открыть 666/667 (ufw + firewall облака);
  выставить `PROD_CERT_DIR`; перезапустить Caddy.
