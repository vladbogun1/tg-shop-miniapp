# tg-shop-miniapp (Spring Boot + MySQL + Telegram Mini App)

Минимальный скелет магазина:
- Telegram Bot (Long Polling) с кнопкой WebApp
- Mini App (статический фронт `/static/app/*`)
- REST API для каталога и заказов
- Админ-режим: добавление товара из Mini App (только adminUserIds)
- Уведомление о новом заказе в Telegram

## 1) Что нужно в Telegram
1. Создать бота через @BotFather, получить `BOT_TOKEN`, задать `BOT_USERNAME`.
2. В BotFather -> **Bot Settings** -> **Menu Button** / **Domain**:
   - Mini App должен открываться по **HTTPS** (ngrok/cloudflare tunnel/домен).
   - Укажи домен/URL, который ты задаёшь в `WEBAPP_BASE_URL`.
3. Запусти бота и сделай `/start`.

Команды:
- `/shop` — открыть магазин
- `/admin` — открыть админку (только для adminUserIds)
- `/setadminchat` — выполнить в том чате, куда слать уведомления о заказах
- `/help`

## 2) Локальный запуск (быстро)
Нужен MySQL. Можно через Docker:

```bash
docker compose up -d
```

Далее:

```bash
mvn -q -DskipTests spring-boot:run
```

Откроется на `http://localhost:8080`

⚠️ В Telegram Mini App нужен HTTPS. Для локалки используй туннель (ngrok / cloudflare tunnel)
и укажи `WEBAPP_BASE_URL=https://....`.

## 3) ENV переменные
- `DB_URL`, `DB_USER`, `DB_PASSWORD`
- `BOT_TOKEN`, `BOT_USERNAME`
- `ADMIN_USER_IDS` (через запятую)
- `ADMIN_CHAT_ID` (опционально; можно настроить через `/setadminchat`)
- `WEBAPP_BASE_URL` (HTTPS)
- `ALLOW_UNSIGNED_INIT_DATA=false` (по умолчанию)

## 4) Примечания
- `price_minor` тут — просто **целое число** (например 1500). Если хочешь копейки — поменяй отображение/формат.
- Картинки товара: в проекте хранится только **URL**.
