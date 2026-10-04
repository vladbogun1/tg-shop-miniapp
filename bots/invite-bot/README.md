# tg-shop-miniapp (Invite Telegram Bot)

Лёгкий Telegram-бот для инвайтов:
- Отвечает на `/start` красивой картинкой.
- Показывает 3 инлайн-кнопки с ссылками на нужные каналы/группы.

## 1) Что нужно в Telegram
1. Создать бота через @BotFather, получить `BOT_TOKEN`, задать `BOT_USERNAME`.
2. Запусти бота и сделай `/start`.

## 2) Запуск через Docker

```bash
docker compose up -d
```

## 3) Локальный запуск

```bash
mvn -q -DskipTests spring-boot:run
```

## 4) ENV переменные
- `BOT_TOKEN`
- `BOT_USERNAME`
- `LANDING_IMAGE_URL` (URL на картинку для лендинга)
