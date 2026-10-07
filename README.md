<div align="center">

# ChiSetup — магазин игровых девайсов: сайт, Telegram Mini App и админка

**[chisetup.com.ua](https://chisetup.com.ua)** — сайт · **app.chisetup.com.ua** — Mini App в Telegram
(бот [@ChiSetupShop_bot](https://t.me/ChiSetupShop_bot)) · **admin.chisetup.com.ua** — админка.

Java 21 / Spring Boot + Next.js 15, дизайн v3 ChiSetup (одна тёмная тема), self-hosted в Docker.

[![CI](https://github.com/vladbogun1/tg-shop-miniapp/actions/workflows/ci.yml/badge.svg)](https://github.com/vladbogun1/tg-shop-miniapp/actions/workflows/ci.yml)
![Java](https://img.shields.io/badge/Java-21-orange)
![Spring%20Boot](https://img.shields.io/badge/Spring%20Boot-3.4-green)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![MySQL](https://img.shields.io/badge/MySQL-8.4-blue)

</div>

---

## Что есть

**Сайт** (`site/`, SSR/ISR, uk по умолчанию + `/ru`, `/en`): каталог по категориям с фильтрами и
поиском, страница товара, корзина, оформление заказа, кабинет с заказами и чатом, отзывы, вопросы
до покупки, юридические страницы, SEO (метаданные, JSON-LD, sitemap, фиды Google/Hotline). Вход —
только через бота (подтверждение в Telegram), заказ только после входа. Корзина после входа общая с
Mini App.

**Telegram Mini App** (`frontend/`, mobile-first, uk/ru/en): каталог, карточка товара, корзина,
пошаговое оформление (контакты → Нова Пошта с отделением на карте или самовывоз → оплата),
заказы с таймлайном, чат с магазином в реальном времени (WebSocket), чеки, отзывы, поддержка.

**Оплата** — monobank-эквайринг (с v3.9.0): полная оплата онлайн или предоплата 100 ₴ + наложенный
платёж. 24 часа на оплату, иначе автоотмена с возвратом на склад. Оплата не подтверждает заказ —
его подтверждает админ; возвраты — кнопкой из админки. Фискальные чеки — Вчасно.Каса через monobank.
Подробно — [`docs/MONOBANK-ACQUIRING.md`](docs/MONOBANK-ACQUIRING.md).

**Админка** (`frontend-admin/`, русский интерфейс, PWA с push): вход паролем или через Telegram,
затем обязательная 2FA (TOTP); главный админ управляет учётками и приглашениями. Разделы:
«Внимание», канбан и таблица заказов (оплата, возвраты, отмены, скидки, подарки, чат с клиентом),
поддержка, отправка, метрики, пользователи (с картой), рассылки, товары, отзывы, теги, промокоды,
способы оплаты, переводы контента, журнал (действия админов и «Бот и сайт» — что бот кому отправил и
доставлено ли, события сайта и Mini App), настройки.

**Бот** (часть бэкенда): вход в Mini App, вход на сайт, уведомления о заказах в админ-чат с темами
по статусам, личные сообщения покупателю (статусы, ответы, оплата, чеки).
Отдельный модуль `bots/invite-bot` — бот-приглашения в канал (свой CI и образ).

**Картинки:** MinIO → imgproxy (ресайз, WebP/AVIF) → nginx (дисковый кэш).

---

## Архитектура

```
браузер ── chisetup.com.ua ───────▶ gateway-site  ─┐
Telegram ─ app.chisetup.com.ua ───▶ gateway       ─┼─▶ Next.js (site / frontend / frontend-admin)
админ ──── admin.chisetup.com.ua ─▶ gateway-admin ─┘   /api, /ws ─▶ Spring Boot ──▶ MySQL
                                                        /img ─────▶ nginx-кэш ◀─ imgproxy ◀─ MinIO
Spring Boot ◀─▶ Telegram Bot API, monobank (вебхуки), Нова Пошта
```

На проде 80/443 держит edge Caddy хоста (TLS автоматически), за ним — gateway'и из
`docker-compose.public.yml` / `docker-compose.prod.yml`. Старые адреса `maxsolkh.shop`, `:666`,
`:667` отвечают только 301-редиректом.

**Стек:** Java 21 · Spring Boot 3.4 (Security/JWT, WebSocket, Flyway, Actuator, Caffeine) ·
MySQL 8.4 · Next.js 15 + TypeScript + Tailwind v4 + TanStack Query + framer-motion · MinIO +
imgproxy + nginx · Docker Compose.

---

## Структура

```
backend/         Spring Boot API + бот (package com.maxsolch.shop), миграции Flyway
shared/          @shop/shared — общий код фронтов: деньги, даты, правила заказов, HTTP-клиент,
                 типы API, WebSocket, i18n-ядро, маска телефона, геометрия логотипа
site/            Next.js — сайт
frontend/        Next.js — Telegram Mini App
frontend-admin/  Next.js — админка
bots/invite-bot/ отдельный бот-приглашения
e2e/             Playwright-тесты
infra/           gateway'и (nginx), Caddyfile старых адресов, служебные скрипты
docs/            контракты и runbook'и; docs/archive/ — устаревшие документы
```

Фронты — один npm workspace; `shared/` подключается как TypeScript-исходник через
`transpilePackages`, без отдельной сборки.

---

## Быстрый старт (локально)

Требуется Docker.

```bash
cp .env.example .env          # заполнить секреты: JWT_SECRET, BOT_TOKEN, ADMIN_*, S3_*, IMGPROXY_*
docker compose up -d --build
```

Backend локально — с `SPRING_PROFILES_ACTIVE=dev`: вне этого профиля он не стартует с небезопасными
настройками (см. [`docs/SECURITY.md`](docs/SECURITY.md)). Подробно — [`docs/LOCAL-TESTING.md`](docs/LOCAL-TESTING.md).

- Mini App: http://localhost:3000 · Админка: http://localhost:3001 · Сайт: http://localhost:3007
- API: http://localhost:8080 · MinIO-консоль: http://localhost:9003 · Картинки: http://localhost:8082/img/...

Фронты без Docker (один `npm install` из корня):

```bash
npm run dev -w frontend        # Mini App → http://localhost:3004
npm run dev -w frontend-admin  # админка  → http://localhost:3005
npm run dev -w site            # сайт     → http://localhost:3006
```

Mini App требует HTTPS: для теста в Telegram — туннель на single-origin gateway
(`docker-compose.public.yml`) и его URL в `WEBAPP_BASE_URL`.

---

## Тесты и CI

- Бэкенд: `cd backend && mvn test` (JUnit 5 + Mockito).
- Фронты: `npm run lint`, `npm run typecheck`, `npm run build` для каждого workspace (`-w frontend`,
  `-w site`, `-w frontend-admin`).
- E2E: `npm run e2e` (Playwright, `e2e/`).
- CI — [`.github/workflows/ci.yml`](.github/workflows/ci.yml); образы для прода собирает
  [`publish.yml`](.github/workflows/publish.yml) по тегу `v3.*`.

---

## Конфигурация и деплой

Всё — через `.env` (см. [`.env.example`](.env.example)). Секреты (`JWT_SECRET`, `BOT_TOKEN`,
`MONOBANK_TOKEN`, `ADMIN_2FA_KEY`, пароли) в репозиторий не коммитятся — **репозиторий публичный**.
Админы живут в таблице `admin_users`: `ADMIN_LOGIN`/`ADMIN_PASSWORD` только создают первую учётку на
пустой базе. Деньги — в минорных единицах (копейки).

- Деплой и эксплуатация — [`docs/DEPLOY-SERVER.md`](docs/DEPLOY-SERVER.md), TLS — [`docs/TLS-RENEWAL.md`](docs/TLS-RENEWAL.md).
- Безопасность и чек-лист перед выкаткой — [`docs/SECURITY.md`](docs/SECURITY.md), вход админов и 2FA — [`docs/ADMIN-2FA.md`](docs/ADMIN-2FA.md).
- Контракт API — [`docs/SPEC.md`](docs/SPEC.md), сайт — [`docs/SITE-SPEC.md`](docs/SITE-SPEC.md),
  дизайн — [`docs/DESIGN-V3.md`](docs/DESIGN-V3.md), переводы контента — [`docs/CONTENT-I18N.md`](docs/CONTENT-I18N.md),
  заказы/поддержка/отзывы — [`docs/ORDERS-SUPPORT-REVIEWS.md`](docs/ORDERS-SUPPORT-REVIEWS.md).
- Отложенные дела — [`docs/TODO.md`](docs/TODO.md).

Удалено при чистке 2026-10 ([`docs/CLEANUP-AUDIT-2026-10.md`](docs/CLEANUP-AUDIT-2026-10.md)):
одноразовый модуль переноса старой БД `migration/`, «закрытый сайт» с кодом доступа, служебная
Thymeleaf-страница бэкенда, неиспользуемые эндпоинты (`/api/tags` и др.), одноразовые скрипты
`infra/np_create_*.py` и `infra/ngrok-policy.yml`. Миграция V48 удаляет таблицы и колонки старой оплаты
на карту — это точка невозврата: откат бэкенда на v3.10.0 и ниже после неё невозможен.
