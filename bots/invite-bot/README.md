# invite-bot

Telegram-бот-«визитка»: на `/start` отправляет картинку с подписью и три URL-кнопки
(Магазин, Отзывы, Основной канал). Отдельное приложение, с магазином не связано.

- Java 21, Spring Boot 4, `telegrambots-spring-boot-starter` (long polling). HTTP-сервера нет, порты не нужны.
- Код: `src/main/java/shop/maxsolch/invitebot/`, тексты и ссылки — `src/main/resources/application.yml`.
- Образ: `vladbogun1/maxsolch-invite-bot` (linux/arm64), собирает `.github/workflows/invite-bot.yml`.
- Прод: сервер №2 (150.136.127.73, arm64), каталог `~/TELEGRAM_BOTS/tg-shop-miniapp/`,
  контейнер `telegram-maxsolch-invite-bot`.

## Настройки (ENV)

| Ключ | Назначение |
|---|---|
| `BOT_TOKEN`, `BOT_USERNAME` | бот из @BotFather |
| `LANDING_IMAGE_URL` | картинка на `/start` |
| `TZ` | часовой пояс (по умолчанию Europe/Warsaw) |
| `INVITE_CAPTION` | подпись под картинкой |
| `INVITE_{SHOP,REVIEWS,CHANNEL}_{TEXT,URL}` | текст и ссылка каждой кнопки |
| `INVITE_BOT_TAG` | (только compose) какой релиз образа запускать, например `1.0.0` |

Значения по умолчанию лежат в `application.yml`. Необязательные `INVITE_*` не задавайте пустыми:
пустая строка заменит значение по умолчанию. Шаблон: `.env.example`.

Один `BOT_TOKEN` нельзя запускать в двух местах: второй поллер получит `409 Conflict`.
Локально запускайте с отдельным тестовым ботом.

## Сборка и тесты

```bash
cd bots/invite-bot
mvn -B verify                       # тесты + target/app.jar
BOT_TOKEN=... BOT_USERNAME=... mvn spring-boot:run
docker build -t invite-bot:dev .    # тот же образ, что собирает CI
```

## CI и образы

| Событие | Что делает `invite-bot.yml` | Теги образа |
|---|---|---|
| PR с правками в `bots/invite-bot/**` | `mvn verify` | — |
| push в `master` с правками бота | verify + сборка | `:sha-<7 символов>`, `:edge` |
| тег `invite-bot-vX.Y.Z` | verify + сборка | `:X.Y.Z`, `:latest` |
| тег `invite-bot-vX.Y.Z-rc1` / `-beta` / `-alpha` | verify + сборка | только `:X.Y.Z-rc1` |

CI магазина (`ci.yml`) правки в `bots/**` игнорирует. Теги магазина (`v2.*`) с тегами бота не пересекаются.

## Выпустить релиз

```bash
git switch master && git pull
git tag invite-bot-v1.0.1
git push origin invite-bot-v1.0.1
gh run watch "$(gh run list --workflow invite-bot.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

## Задеплоить (сервер №2)

На сервере тег прибит в `.env` (`INVITE_BOT_TAG`). Автообновления нет, `:latest` не используется.

```bash
ssh ubuntu@150.136.127.73
cd ~/TELEGRAM_BOTS/tg-shop-miniapp
sed -i 's/^INVITE_BOT_TAG=.*/INVITE_BOT_TAG=1.0.1/' .env
docker compose pull && docker compose up -d
docker logs --since 2m telegram-maxsolch-invite-bot   # ждём "Bot registered successfully", без 409
```

`docker-compose.yml` на сервере — копия `bots/invite-bot/docker-compose.yml`.
Compose пересоздаёт контейнер с тем же `container_name`, поэтому старый останавливается до старта нового.

## Откатить

Рядом с compose на сервере лежат `rollback.sh` и `ROLLBACK.md`:

```bash
./rollback.sh 1.0.0      # вернуть предыдущий релиз (меняет INVITE_BOT_TAG в .env, pull, up -d)
./rollback.sh --build    # аварийно: старый локально собранный образ tg-shop-miniapp-app:rollback-20261004
```

История: бот импортирован из ветки `bots/invite-bot` (коммит 6d5f565).
До 2026-10-04 образ собирался на сервере из клона этой ветки.
