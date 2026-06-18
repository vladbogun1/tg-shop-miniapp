<div align="center">

# 🛍️ Maxsolch 2.0 — Telegram Mini App магазин

**Интернет-магазин внутри Telegram** — каталог, корзина, пошаговый заказ, чат с админом и
полноценная веб-админка. Переписан с нуля: Java 21 / Spring Boot + Next.js 15, дизайн в стиле
**Liquid Glass**, self-hosted инфраструктура без облаков.

[![CI](https://github.com/vladbogun1/tg-shop-miniapp/actions/workflows/ci.yml/badge.svg)](https://github.com/vladbogun1/tg-shop-miniapp/actions/workflows/ci.yml)
![Java](https://img.shields.io/badge/Java-21-orange)
![Spring%20Boot](https://img.shields.io/badge/Spring%20Boot-3.4-green)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![MySQL](https://img.shields.io/badge/MySQL-8.4-blue)

</div>

---

## 📸 Скриншоты

<div align="center">

| Каталог | Карточка товара | Корзина / чекаут |
|:---:|:---:|:---:|
| <img src="docs/screenshots/catalog.png" width="240"/> | <img src="docs/screenshots/product.png" width="240"/> | <img src="docs/screenshots/cart-checkout.png" width="240"/> |

| Аккаунт + чат | Канбан-доска (админка) | Метрики (админка) |
|:---:|:---:|:---:|
| <img src="docs/screenshots/account-chat.png" width="240"/> | <img src="docs/screenshots/admin-board.png" width="240"/> | <img src="docs/screenshots/admin-metrics.png" width="240"/> |

</div>

> Файлы скриншотов — в [`docs/screenshots/`](docs/screenshots/) (см. инструкцию там).

---

## ✨ Возможности

**Покупатель (Telegram Mini App, mobile-first):**
- Каталог с поиском и фильтром по тегам, фото-галерея, варианты товара, остатки.
- Карточка товара на весь экран; «В корзину» превращается в «− кол-во +».
- Корзина + **пошаговый чекаут**: контакты → доставка (**Новая Почта** с выбором отделения / самовывоз) → выбор варианта оплаты → подтверждение.
- Личный кабинет: история заказов, детальная карточка с таймлайном, **чат с админом в реальном времени** (WebSocket, в стиле Telegram), колокольчик новых сообщений.

**Админ (веб, desktop-first, адаптив под мобилку):**
- Вход по логину/паролю (Spring Security + BCrypt + JWT).
- **Канбан-доска** заказов с drag&drop по статусам; разворот заказа с деталями, таймлайном и встроенным чатом с клиентом; хард-удаление терминальных заказов.
- Таблица заказов с сортировкой и фильтрами по сроку (месяц/полгода/год/всё).
- CRUD товаров (с загрузкой картинок), тегов, промокодов; настройки оплаты; **дашборд метрик** (выручка, заказы, статусы, топ-товары, скорость обработки).

**Бот (тонкий):** кнопка-вход в Mini App, уведомления о заказах в мультигруппу с темами по статусам (карточка «переезжает» между темами), DM покупателю о смене статуса и новых сообщениях.

**Картинки:** MinIO (хранилище) → imgproxy (ресайз/WebP/AVIF) → Nginx (disk-кэш) — быстрая отдача под устройство.

---

## 🏗️ Архитектура

```
Telegram ──/start──▶ Bot (тонкий: вход + уведомления)
                         │
 Mini App (Next.js) ─REST/WS─▶ Spring Boot API ──JPA──▶ MySQL
 Admin   (Next.js) ─REST/WS─▶  (Security+JWT,            │
                               WebSocket-чат,        S3 │
                               бот, Nova Poshta)        ▼
                                          MinIO ◀─ imgproxy ◀─ Nginx (кэш) ◀─ браузер (картинки)
```

**Стек:** Java 21 · Spring Boot 3.4 (Security/JWT, WebSocket, Flyway, springdoc/Swagger, Actuator, Caffeine) · MySQL 8.4 · Next.js 15 + TypeScript + Tailwind v4 + TanStack Query · MinIO + imgproxy + Nginx · Docker Compose.

---

## 📁 Структура

```
backend/        Spring Boot API (package com.maxsolch.shop)
frontend/       Next.js — Mini App покупателя
frontend-admin/ Next.js — админка
migration/      тулза импорта старой БД (JDBC + картинки в MinIO)
infra/          nginx-конфиги, gateway'и, SQL-бэкфиллы, скрипты
docs/           SPEC.md (контракт API), screenshots/
docker-compose.yml           основной локальный стек
docker-compose.public.yml    публичный релиз (gateway + туннель для Telegram)
```

Подробный контракт API — [`docs/SPEC.md`](docs/SPEC.md). Дизайн и история — `ДИЗАЙН-ДОКУМЕНТ-*.md`, `HANDOFF.md`.

---

## 🚀 Быстрый старт (локально)

Требуется Docker.

```bash
cp .env.example .env          # заполнить секреты: JWT_SECRET, BOT_TOKEN, ADMIN_*, S3_*, IMGPROXY_*
docker compose up -d --build
```

- Mini App: http://localhost:3000
- Админка: http://localhost:3001 (логин/пароль из `ADMIN_LOGIN`/`ADMIN_PASSWORD`)
- API + Swagger: http://localhost:8080/swagger-ui.html · Home: http://localhost:8080/
- MinIO консоль: http://localhost:9003 · Картинки: http://localhost:8082/img/...

### Импорт старой базы (опционально)
См. [`migration/README.md`](migration/README.md): JDBC переносит товары/заказы/чат и заливает картинки в MinIO, затем SQL-бэкфиллы таймингов и причин отказа.

### Тест в Telegram
Mini App требует HTTPS. Для локального теста — `cloudflared tunnel --url http://localhost:8090` (single-origin gateway, см. `docker-compose.public.yml`), затем вписать URL в `WEBAPP_BASE_URL`. В проде — Caddy + домен.

---

## ✅ Тесты и CI

- Бэкенд: `cd backend && mvn test` (JUnit 5 + Mockito — расчёт заказа/скидок/стока, переходы статусов, метрики, JWT, валидация initData).
- Фронты: `npm run build` в `frontend/` и `frontend-admin/`.
- **CI** (GitHub Actions, [`.github/workflows/ci.yml`](.github/workflows/ci.yml)): на каждый push/PR — тесты бэкенда + сборка обоих фронтов.

---

## 🔐 Конфигурация

Всё — через `.env` (см. [`.env.example`](.env.example)). Ключевое: `DB_*`, `JWT_SECRET`, `ADMIN_LOGIN`/`ADMIN_PASSWORD`, `BOT_TOKEN`, `NOTIFY_CHAT_ID` + темы, `S3_*`, `IMGPROXY_*`, `WEBAPP_BASE_URL`/`ADMIN_BASE_URL`. Деньги — в минорных единицах (копейки). Секреты в репозиторий не коммитятся (`.env` в `.gitignore`).

---

## 📦 Деплой (прод)

Self-hosted на одном Linux-сервере в Docker: `docker compose up -d --build` + reverse-proxy (Caddy) с сертификатами на нужных портах, постоянные домены в `WEBAPP_BASE_URL`/`ADMIN_BASE_URL`, `ALLOW_UNSIGNED_INIT_DATA=false`, подписанные imgproxy-URL, сильные секреты.

---

<div align="center">
Сделано с ❤️ для Telegram-коммерции.
</div>
