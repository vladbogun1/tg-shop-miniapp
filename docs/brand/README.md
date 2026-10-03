# MAXSOLCH — бренд для Telegram

Тот же логотип, что на сайте (`site/components/layout/Logo.tsx`): жирное `MAX` + оранжевое
`SOLCH` на чернильной плашке, толстая рамка и жёсткая оранжевая тень (нео-брутализм).
В Mini App это компонент `frontend/components/Logo.tsx`.

## Файлы

| Файл | Что это |
|---|---|
| `bot-avatar.png` (640×640) | **Аватар бота** — «MAX / SOLCH» в две строки. Читается даже в списке чатов (48 px). |
| `bot-avatar-alt.png` (640×640) | Запасной вариант — монограмма «MS». |
| `miniapp-cover-640x360.png` | Картинка для описания бота / Mini App в BotFather (640×360). |
| `*.svg` | Исходники; текст переведён в кривые, шрифт для просмотра не нужен. |
| `icon-64.svg` | Монограмма для вкладки; копия лежит в `frontend/app/icon.svg`. |
| `build_brand.py`, `render_png.mjs` | Генерация SVG и PNG (см. ниже). |

Telegram обрезает аватар кругом — плашка с тенью целиком помещается во вписанную окружность.

## Палитра

Совпадает с `frontend/app/globals.css` и `site/app/globals.css` (светлая тема).

| Токен | HEX | Где |
|---|---|---|
| `--bg` | `#F4F1E6` | кремовый фон, «MAX» на плашке |
| `--ink` / `--line` | `#141414` | плашка, рамки, текст |
| `--accent` | `#FF5A2C` | «SOLCH», тень логотипа (в тёмной теме `#FF6A3D`) |
| `--c3` | `#FFD23F` | жёлтые стикеры |
| `--c2` | `#2F6BFF` | синий акцент |
| `--c4` | `#16B36B` | зелёный акцент |
| `--c5` | `#FF73B5` | розовый акцент |
| тёмная тема `--bg` | `#26262B` | в тёмной теме плашка кремовая, «MAX» графитовое |

Шрифт — **Inter Black (900)**, заглавные, `letter-spacing: -0.025em` (Tailwind `tracking-tight`).
Сайт и Mini App подключают его через `next/font/google`.

## Как поменять аватар бота

Аватар бота может поставить только владелец бота, через BotFather:

1. Открыть [@BotFather](https://t.me/BotFather) → `/setuserpic`.
2. Выбрать **@ChiSetupShop_bot** (боевой бот).
3. Отправить `bot-avatar.png` **как фото** (не файлом).

Картинка описания: `/mybots` → @ChiSetupShop_bot → Edit Bot → Edit Description Picture →
отправить `miniapp-cover-640x360.png`. Её же можно задать для Mini App
(`/myapps` → приложение → Edit Photo — Telegram просит именно 640×360).

Дев-бот — **@maxsolch_bot**: тем же способом, если хочется, чтобы и он отличался от безликого.

## Перегенерация

Нужны Python с `fonttools` + `brotli` и собранный фронт (`npm run build -w frontend` кладёт
woff2 Inter в `frontend/.next/static/media`; можно передать пути к woff2 аргументами).

```bash
python docs/brand/build_brand.py        # -> *.svg (текст в кривых)
node docs/brand/render_png.mjs          # -> *.png через sharp
cp docs/brand/icon-64.svg frontend/app/icon.svg
```
