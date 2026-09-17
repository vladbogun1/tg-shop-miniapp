# Локальный стенд для проверки UI

Зачем: дефекты вроде «у блока итогов нет фона» или «кнопка спряталась под сгибом»
находились только владельцем на телефоне. Стенд поднимает магазин и админку
локально на данных прода, с работающей авторизацией Telegram, чтобы такие вещи
можно было воспроизводить и проверять до выкатки — в том числе автоматически,
через Playwright.

Локальные данные (дамп, картинки) лежат в `.devdata/` и в git не попадают.

---

## 1. Инфраструктура

Локальный оверлей `docker-compose.dev.yml` делает две вещи: берёт образы MinIO и
imgproxy из реестров, где они доступны без логина (Docker Hub отдаёт
`minio/minio` и `darthsim/imgproxy` только авторизованным), и включает профиль
`dev` вместе с `ALLOW_UNSIGNED_INIT_DATA` — иначе заглушка Telegram не пройдёт
проверку подписи. **Вне профиля `dev` бэкенд с этим флагом не стартует вовсе**
(`StartupSecurityCheck`), так что на прод это не переносится.

```bash
C="-f docker-compose.yml -f docker-compose.dev.yml"
docker compose $C up -d mysql minio minio-init imgproxy nginx backend
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/actuator/health   # 200
```

Фронты запускаются дев-серверами Next, чтобы правки в UI были видны сразу:

```bash
npm install                 # один раз, в корне: это npm workspaces
npm run dev -w frontend         # магазин  → http://localhost:3004
npm run dev -w frontend-admin   # админка  → http://localhost:3005
```

## 2. Данные прода

**База.** Снять дамп на сервере и залить локально:

```bash
SRV="ubuntu@132.145.132.80"
KEY="C:/Users/nikto/oracleserver.key"
ssh -i $KEY $SRV 'cd /home/ubuntu/TELEGRAM_BOTS/maxsolch-v2 && \
  docker compose exec -T mysql sh -c "mysqldump -uroot -p\$MYSQL_ROOT_PASSWORD --single-transaction tgshop_v2" | gzip' \
  > .devdata/prod.sql.gz

DBP=$(grep -E "^DB_ROOT_PASSWORD=" .env | cut -d= -f2-)
DBN=$(grep -E "^DB_NAME=" .env | cut -d= -f2-)
gunzip -c .devdata/prod.sql.gz | docker compose exec -T mysql mysql -uroot -p"$DBP" "$DBN"
```

**Картинки.** Оригиналы лежат в томе MinIO (≈260 МБ, товары и вложения чата — один
бакет). У самого образа MinIO нет `tar`, поэтому том читается вспомогательным
контейнером:

```bash
ssh -i $KEY $SRV 'docker run --rm -v maxsolch-v2_minio_data:/d alpine tar -C /d -cf - product-images' \
  > .devdata/product-images.tar
docker run --rm -i -v tg-shop-v2_minio_data:/d alpine sh -c 'rm -rf /d/product-images && tar -C /d -xf -' \
  < .devdata/product-images.tar
docker restart tgshop_v2_minio
```

Проверка, что imgproxy отдаёт картинку (должно быть `200 image/webp`):

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  "http://localhost:8082/img/insecure/rs:fill:600:600/plain/s3://product-images/products/<uuid>/<файл>.jpg@webp"
```

## 3. Вход как покупатель

В обычном браузере нет `window.Telegram.WebApp`, поэтому Mini App остаётся
неавторизованным. В `frontend/app/layout.tsx` есть заглушка, которая включается
параметром `?tgstub=<telegram_user_id>`:

```
http://localhost:3004/?tgstub=502540144
```

Что важно знать:

- блок заглушки обёрнут в `process.env.NODE_ENV === "development"`, Next
  подставляет значение на сборке, так что из прод-бандла он вырезается;
- `window.Telegram` запирается через `defineProperty` — `telegram-web-app.js`
  грузится ниже и иначе перезаписал бы заглушку пустым `initData`;
- `platform: "web"`, иначе приложение просит fullscreen, которого в браузере нет;
- любой `telegram_user_id` из таблицы `users` подойдёт; удобно брать того, у кого
  есть заказы с перепиской.

Найти подходящего покупателя и его заказ с фото в чате:

```bash
docker compose exec -T mysql mysql --default-character-set=utf8mb4 -uroot -p"$DBP" -N -e \
  "select BIN_TO_UUID(o.id), o.tg_user_id from $DBN.order_messages m
     join $DBN.orders o on o.id = m.order_id
    where m.type='PHOTO' order by m.id desc limit 5;"
```

Админка (`http://localhost:3005`) авторизуется обычным логином и паролем из `.env`
(`ADMIN_LOGIN` / `ADMIN_PASSWORD`), заглушка ей не нужна.

## 4. Проверка через Playwright

Размер окна стоит ставить как у телефона (`390×844`), потому что почти все
найденные дефекты — про нехватку высоты и про перекрытие нижним доком.

Полезное:

- клики по элементам Leaflet идут мимо обычных селекторов — проще кликать
  `.marker-cluster` и `.np-pin` напрямую через `browser_evaluate`;
- значения в React-полях нужно ставить через нативный сеттер
  (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`),
  иначе React не увидит изменение;
- после действий стоит смотреть консоль: гонка «запрос ушёл раньше токена»
  проявляется как 403 на `/api/me/**`, а на экране — как «не удалось загрузить».

## 5. Промокоды для тестов

В дампе прода все коды обычно уже израсходованы (`uses_count = max_uses`).
Свои лимитированные коды для проверки резерва:

```bash
docker compose exec -T mysql mysql -uroot -p"$DBP" -e "
insert into $DBN.promo_codes (id, code, discount_percent, discount_amount_minor, max_uses, uses_count, active)
values (UUID_TO_BIN(UUID()), 'TEST10', 10, 0, 2, 0, 1),
       (UUID_TO_BIN(UUID()), 'LIMIT1', 0, 5000, 1, 0, 1);"
```

Резервы видно так:

```bash
docker compose exec -T mysql mysql -uroot -p"$DBP" -N -e \
  "select p.code, r.telegram_user_id, r.expires_at
     from $DBN.promo_reservations r join $DBN.promo_codes p on p.id = r.promo_code_id;"
```

## 6. Чего стенд НЕ покрывает

- Telegram-бот (уведомления, кнопки) — для этого нужен реальный токен и вебхук;
- поведение самого клиента Telegram: fullscreen, safe-area, системная клавиатура.
  Прятание таб-бара по клавиатуре опирается на `visualViewport`, и проверить его
  по-настоящему можно только на телефоне;
- HTTPS-контур (Caddy, gateway) — локально фронты ходят на `localhost:8080`
  напрямую.
