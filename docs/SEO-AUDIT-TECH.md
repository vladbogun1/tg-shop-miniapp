# Технический SEO-аудит chisetup.com.ua

Дата: 2026-10-05. Проверено: код `tg-shop-v2/site` (Next 15.5, App Router) + `backend` (PublicCatalogService) + живой прод (curl, только GET; браузерный замер LCP/CLS).
PageSpeed Insights API вернул `429 Quota exceeded` (суточная квота анонимного ключа исчерпана), поэтому вместо него — ручной замер в браузере (без троттлинга CPU/сети, вьюпорт 375×812) и анализ ассетов через curl.

---

## 0. Краткие цифры с прода

| Что | Значение |
|---|---|
| robots.txt | открыт (`SITE_INDEXABLE=true`), `Sitemap:` указан |
| sitemap.xml | 246 `<url>`: 9 статических + 14 категорий + 223 товара; `lastmod` только у товаров; ru/en — только как `xhtml:link`, без x-default |
| Товары (API) | 223 в каждой из 3 локалей; пустых описаний 0; uk≠ru для всех; en без кириллицы; `seoTitle/seoDescription` = null у всех 223 |
| Категории | 14, из них **2 пустые**: `kresla` (0), `stoly` (0) — в меню и в sitemap |
| Товары без категории | 6 (`westlab-universal-dot-mouse-skates-oranzhevye`, `rukav-tkanevyy-drakon`, `rukav-budda-drakon`, `klaviatura-ajazz-af68`, `yunzii-x98-belaya`, …) |
| HTML главной | 252 КБ raw / 66 КБ gzip, из них ~128 КБ — RSC flight-данные (16 полных описаний товаров) |
| JS | ~230 КБ gzip на главной (20 чанков), кэш `immutable` 1 год — ок |
| Шрифты | 9 woff2 на странице (Inter + Exo 2: 4 веса × normal/italic, latin+cyrillic) |
| Картинки | imgproxy → WebP, `srcset`+`sizes`, кэш 1 год, `X-Cache-Status: HIT`; AVIF нет |
| Замер (браузер, без троттлинга) | товар: TTFB 200 мс, FCP 612 мс, LCP 1652 мс (фото), CLS 0, 869 КБ; категория: FCP 316 мс, LCP 1000 мс, CLS 0, 199 КБ |
| Сжатие | gzip; brotli нет |
| HTTPS/HSTS | `max-age=31536000; includeSubDomains`, без `preload` |
| Редиректы | `maxsolkh.shop/*` → 301 на `chisetup.com.ua/*` с путём и query ✅; `www` → 301 apex ✅; `/uk/*` → 308 без префикса ✅; `/path/` → 308 без слэша ✅ |

---

## 1. Таблица проблем

Приоритет: **P0** — мешает индексации прямо сейчас; **P1** — заметно влияет на ранжирование/CTR; **P2** — гигиена, делать по возможности.

| # | Пр. | Проблема | Где в коде | Как исправить |
|---|---|---|---|---|
| 1 | **P0** | **`<title>`, `meta description`, `canonical`, `hreflang`, `robots`, OG — в `<body>`, а не в `<head>`.** Next 15.2+ «стримит» метаданные для всех UA, кроме списка `htmlLimitedBots` (там Bing/Yandex/соцсети, но **не Googlebot**). curl с UA Googlebot: `</head>` на байте 3480, `<title>` на байте 66715. В браузере после гидратации — тоже `BODY>link[rel=canonical]`, `BODY>title`, все 4 hreflang в BODY (проверено через DOM). Google официально **игнорирует `rel=canonical` и hreflang вне `<head>`**. | `site/next.config.ts:64` (опция отсутствует) | Добавить в `nextConfig`: `htmlLimitedBots: /.*/` — метаданные будут блокирующе рендериться в `<head>` для всех. Проверка: `curl -A Googlebot … \| grep -bo '<title>'` должен быть < позиции `</head>`. |
| 2 | **P1** | **Пустые категории индексируются.** `kresla` и `stoly` — 0 товаров, но 200 OK, в меню, в футере, в sitemap → soft-404 / thin content. | `backend/.../PublicCatalogService.java:149-152` (sitemap не смотрит на счётчик); `site/app/[locale]/catalog/[category]/page.tsx:36-41` | В sitemap отдавать только категории с `productCount>0` (или считать как в `categories()`); в `generateMetadata` категории ставить `robots: {index:false, follow:true}` при `productCount===0`; в меню/футере скрывать пустые (или временно снять `showInMenu`). |
| 3 | **P1** | **Title/description категорий слабые и шаблонные.** Title `Килимки · ChiSetup` (18 симв.), description `Килимки — Мишки, клавіатури, килимки та аксесуари. Доставка…` (одинаковый хвост на всех 14 категориях). H1 — одно слово («Килимки», «Глайди», «Дуйки»). Нет ни «купити», ни «для миші», ни «Україна/Харків». Текста категории нет вообще. | `site/app/[locale]/catalog/[category]/page.tsx:37-38`; `components/catalog/CatalogView.tsx:86-88` | Добавить в tag (бэкенд, с переводами uk/ru/en) поля `seoTitle`, `seoDescription`, `h1`, `intro` (SEO-текст 100–300 слов под сеткой). Фолбэк-шаблон: title `Ігрові килимки для миші — купити в Україні \| ChiSetup`, description «{Категорія} у наявності: {N} моделей від {min} ₴. Доставка Новою Поштою 1–2 дні, самовивіз у Харкові.» |
| 4 | **P1** | **Title товара = голое название.** `ATTACK SHARK F1 AIR · ChiSetup`, `Turbo Jet Fan · ChiSetup`. Нет типа товара и коммерческого слова; 53 товара имеют одинаковое название на uk/ru/en → у ru/en страниц тайтлы совпадают с uk. `seoTitle` у всех null. | `site/app/[locale]/product/[slug]/page.tsx:56-58` | Фолбэк: `{title} — {категория в ед. ч.} купити \| ChiSetup` (`…— ігрова мишка, купити в Україні`), для ru `… — купить в Украине`. Название категории в ед. числе — новое поле у tag или словарь в i18n. Description: первые ~150 симв. описания + «Ціна {price} ₴, доставка НП». |
| 5 | **P1** | **Schema.org Product: `brand` = первое слово названия.** «Рукави Mieyco» → brand «Рукави», «Килимок Attack Shark» → «Килимок». Это неверная разметка (Google может проигнорировать/пометить). Также `sku` = UUID, нет `mpn`/`gtin`, нет `shippingDetails` и `hasMerchantReturnPolicy` (Merchant listings выдаёт предупреждения), нет `priceValidUntil`. | `site/app/[locale]/product/[slug]/page.tsx:103,107,108-116` | Добавить поле `brand` товару (бэкенд) и выводить только если задано; `sku` — человекочитаемый артикул; в `offers` добавить `shippingDetails` (UA, Нова Пошта, 1–2 дня обработка, 1–3 дня доставка) и `hasMerchantReturnPolicy` (14 днів, `MerchantReturnFiniteReturnWindow`), `seller` → ссылка на Organization `@id`. |
| 6 | **P1** | **Картинки товаров отсутствуют в SSR-HTML.** `Image` рендерит `<img>` только после IntersectionObserver (`near`), на сервере `near=false`. На главной 16 карточек — **0 реальных `<img>`**, только SVG-плейсхолдеры `alt=""`; на категории — 4 из 24. Google рендерит JS, но индексация картинок/«Google Картинки» и любые не-JS боты (Bing частично, соцсети, агрегаторы) их не видят. | `site/lib/image.tsx:181, 226` (`{near && <img…>}`) | Всегда рендерить `<img loading="lazy" decoding="async">` в SSR; IO использовать только для `fetchPriority`/подмены. Нативный `loading=lazy` + корректный `sizes` уже решают проблему лишнего трафика, ради которой сделан IO (можно поставить `loading="lazy"` и оставить `NEAR_MARGIN` только как полифилл). |
| 7 | **P1** | **OG/Twitter: нет картинки на главной/категориях/инфо, у категорий og:title = заголовок главной.** У категории `og:title="ChiSetup — ігрові девайси…"` (наследуется из layout). У товара `og:type=website`, нет `og:url`, `og:site_name`/`og:locale` теряются (объект openGraph заменяется целиком). Twitter card на главной `summary` без картинки. Превью ссылок в Telegram — главный канал магазина. | `site/app/[locale]/layout.tsx:60-66`; `product/[slug]/page.tsx:61-66`; `catalog/[category]/page.tsx:36-41` | Добавить `app/opengraph-image.png` (1200×630, бренд) или `openGraph.images` в layout; в каждом `generateMetadata` возвращать `openGraph: {title, description, url, siteName, locale, images}` (сделать хелпер `og(locale, path, {...})`). OG-картинку товара отдавать JPEG (`@jpg`), а не WebP — часть клиентов (старые LinkedIn/Viber/почта) WebP не берёт. |
| 8 | **P1** | **Одинаковые meta description на инфо-страницах.** `/contacts`, `/delivery`, `/returns`, `/warranty`, `/privacy`, `/terms`, `/catalog` — один и тот же `meta.description` главной. | `app/[locale]/contacts/page.tsx:11`, `delivery/page.tsx:9`, аналогично returns/warranty/privacy/terms; `catalog/page.tsx:102-103` | Свой description для каждой страницы (ключ i18n `meta.<page>.description`), напр. delivery: «Доставка Новою Поштою по Україні за 1–2 дні, самовивіз у Харкові, оплата на картку або накладеним платежем.» |
| 9 | **P1** | **Локальное SEO и доверие слабые.** На «Контактах» нет телефона, e-mail и адреса (только Telegram и «Харків — адресу уточнюйте в чаті»). Organization LD без `logo`, `contactPoint`, `address`, `areaServed`; нет `WebSite`. По запросам «… Харків» конкурировать нечем. | `app/[locale]/page.tsx:47-56`; `app/[locale]/contacts/page.tsx` | Указать телефон/e-mail (хотя бы рабочий), город + точку самовывоза (или район). Organization → `OnlineStore` (подтип Organization) с `@id`, `logo`, `contactPoint{telephone, contactType:"customer service", availableLanguage:[uk,ru,en]}`, `address{addressLocality:"Харків", addressCountry:"UA"}`, `sameAs` (бот, канал, Instagram). Добавить `WebSite{name, url, inLanguage}` (для site name в выдаче; SearchAction Google с 11.2024 уже не показывает — можно не добавлять). Завести Google Business Profile, если есть пункт выдачи. |
| 10 | **P1** | **UK-страницы не кэшируются (ISR не работает для языка по умолчанию).** `/`, `/delivery`, `/product/*`, `/catalog/*` на uk отдают `Cache-Control: private, no-cache, no-store`; те же страницы на `/ru/…`, `/en/…` — `s-maxage=60, stale-while-revalidate` и `X-Nextjs-Cache: HIT`. Т. е. каждый запрос к основной (uk) версии рендерится заново → хуже TTFB под нагрузкой и для краулера. | `site/middleware.ts:28-31` (rewrite `/…` → `/uk/…`) | Проверить, почему rewrite из middleware отключает ISR (вероятно, ответ middleware-rewrite помечается dynamic). Варианты: (а) через `next.config.ts rewrites()` (beforeFiles) вместо middleware; (б) оставить middleware только для `/uk` → 308. После правки `curl -I https://chisetup.com.ua/` должен давать `x-nextjs-cache`. |
| 11 | **P2** | **Пагинация закрыта `noindex` и канонизирована на 1-ю страницу.** `?page=2` → `robots: noindex, follow` + `canonical` на страницу 1. Для `kovriki` (63 товара, 3 стр.) товары со 2–3 страниц доступны краулеру только через sitemap; противоречивые сигналы (canonical на другой URL + noindex). | `catalog/[category]/page.tsx:35-40`; `catalog/page.tsx:100-105` | `?page=N` (без других параметров) — индексируемая, canonical на саму себя (`/catalog/kovriki?page=2`), title «… — сторінка 2». `noindex` оставить только для `sort`, `inStock`, `priceMax`, `q`. Либо увеличить `PAGE_SIZE` (бэкенд допускает 60) — тогда почти все категории в 1 странице. |
| 12 | **P2** | **Sitemap: ru/en не имеют своих `<url>`, нет x-default.** Google требует, чтобы каждая языковая версия была отдельным `<url>` со всем набором alternates. Также `lastmod` нет у категорий/статики; у 202 товаров одинаковый `lastmod` (массовая перезаливка описаний 04.10) — нормально, но следите, чтобы правка остатков не обновляла `updatedAt`. | `site/app/sitemap.ts:33-49` | Генерировать запись на каждую пару (локаль, путь): `url: SITE_URL+localePath(l, path)`, alternates — все 3 + `x-default`. Для категорий `lastmod` = max(updatedAt) товаров категории. Отфильтровать пустые категории (см. №2). |
| 13 | **P2** | **ru/en юридические страницы — копия украинского текста** (доставка, возврат, гарантия, privacy, terms) с hreflang ru/en → 3 URL с одинаковым текстом. `lang` у `<article>` выставлен правильно (uk), но для поиска это дубли. | `site/lib/legal.ts:50` (`contentLocale: "uk"`); `app/[locale]/{delivery,returns,warranty,privacy,terms}/page.tsx` | Перевести (лучше), либо до перевода на ru/en: `alternates.canonical` → uk-URL и убрать эти страницы из ru/en hreflang. |
| 14 | **P2** | **RSC-payload раздувает HTML.** Главная: 252 КБ HTML, ~128 КБ — flight-данные; в них полные описания 16 товаров (карточка — client component и получает весь `StorefrontProduct`). | `components/catalog/ProductCard.tsx:104-109` | Передавать в `ProductGrid` облегчённый DTO (id, slug, title, price, compareAt, stock, 1 картинка, variants count) — `description`, все `images`, `tags` не нужны. Ожидаемо −60…80 КБ raw на главной/категории. |
| 15 | **P2** | **Полноэкранный прелоадер** (мин. 500 мс, макс. 4 с) закрывает уже отрисованный SSR-контент при каждой полной загрузке. LCP в Chrome он не ломает (CLS 0, LCP 1.0–1.65 с), но ухудшает Speed Index/воспринимаемую скорость и скриншоты рендера Googlebot. | `components/Preloader.tsx`; `@shop/shared` brand/preloader | Убрать минимальную задержку 500 мс, на сайте показывать только при реальной задержке >300 мс, либо отключить для сайта (оставить в Mini App). |
| 16 | **P2** | **Шрифты: 9 woff2.** Exo 2 грузится в 4 весах × 2 стиля. | `app/[locale]/layout.tsx:22-28` | Оставить нужное: например 700/800 normal + 800 italic (логотип), убрать 500/600 и лишние italic; рассмотреть variable-версию. |
| 17 | **P2** | **Нет brotli и AVIF.** Только gzip; картинки только WebP. | infra edge Caddy / `infra/gateway-site.conf`; imgproxy | Включить `encode zstd br gzip` в edge Caddy (или brotli в nginx); в imgproxy `IMGPROXY_ENABLE_AVIF_DETECTION=true` + `Vary: Accept` (либо `<picture>` с avif). |
| 18 | **P2** | **Дублирующиеся заголовки безопасности.** `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` приходят дважды (Next + nginx); у `/img` — два `Cache-Control`. Не критично, но некоторые валидаторы ругаются, а два CSP — пересечение политик. | `site/next.config.ts:82-94` и `infra/gateway-site.conf:28-32` | Оставить в одном месте (лучше nginx-гейтвей), из `next.config.ts` `headers()` убрать. Для HSTS можно добавить `preload` и подать в hstspreload.org (после проверки всех поддоменов на HTTPS). |
| 19 | **P2** | **404-страница:** title = заголовок главной («ChiSetup — ігрові девайси…»), два `<meta name="robots">` (`noindex` и `index, follow`). Статус 404 корректный. | `app/[locale]/not-found.tsx`; `layout.tsx:67` | В not-found задать `metadata = { title: "Сторінку не знайдено", robots: {index:false} }` (через `generateMetadata` в сегменте или общий `robots` в layout не ставить при 404). Добавить на 404 ссылки на категории/поиск (если ещё нет). |
| 20 | **P2** | **`app.chisetup.com.ua` (Mini App) индексируемый:** нет `robots.txt` (404), нет `noindex`, нет `X-Robots-Tag`. Риск дублей/мусора в выдаче. `admin.` — `noindex` ✅, `demo.` — `Disallow: /` + `noindex` ✅. | edge Caddy / `infra/gateway.conf` | Отдавать на `app.` заголовок `X-Robots-Tag: noindex, nofollow` и robots.txt `Disallow: /`. |
| 21 | **P2** | **Регистр в slug даёт дубль 200.** `/product/ATTACK-SHARK-F1-AIR` → 200 (canonical на нижний регистр — спасает, но лучше редирект). `http://www.` → 2 хопа (308 → https://www → 301 → apex). | `backend/.../PublicCatalogService.java:116` (lowercase); `app/[locale]/product/[slug]/page.tsx:81` | Если `slug !== product.slug` → `permanentRedirect(localePath(locale, '/product/'+product.slug))`. В edge Caddy для `http://www.chisetup.com.ua` редиректить сразу на `https://chisetup.com.ua{uri}`. |
| 22 | **P2** | **robots.txt неполный для ru/en**: закрыты `/ru/account`, `/ru/checkout`, но не `/ru/cart`, `/ru/login`, `/ru/search` (и en). На страницах есть `noindex`, так что это косметика. | `site/app/robots.ts:16` | Сгенерировать список из `LOCALES × ["/account","/checkout","/login","/cart","/search"]`. |
| 23 | **P2** | **6 товаров без категории** → в хлебных крошках нет категории, нет блока «Вам може сподобатися», меньше внутренних ссылок. | данные (админка) | Назначить категорию; в админке сделать категорию обязательной при публикации. |
| 24 | **P2** | **Slug категорий/товаров — русская транслитерация** (`kovriki`, `myshki`, `kresla`, `rukava-mieyco-tsvetochek`) при основном языке uk. Влияние на ранжирование небольшое. | данные | **Не менять** сейчас (потеря накопленных сигналов); если когда-то менять — только с 301 со старых slug (таблица `slug_history`). |
| 25 | **P2** | **Описание товара — один `<p>` с `white-space: pre-line`**, списки «•» — не `<ul>`, нет подзаголовков (h3 «Характеристики»). | `app/[locale]/product/[slug]/page.tsx:156-159` | Парсить строки с «• » в `<ul><li>`, блок характеристик как `<dl>` или таблицу; это лучше читается поиском и даёт шанс на сниппеты. |
| 26 | **P2** | **Отзывов/рейтингов нет** → нет `AggregateRating`/`Review` и звёзд в выдаче. В бэкенде сущности отзывов нет. | — | Добавить сбор отзывов после доставки (бот уже шлёт статусы) и выводить `aggregateRating` только при реальных отзывах на странице. |

---

## 2. Что уже хорошо

- **SSR работает:** весь текст (H1, названия, цены, описания, крошки, футер) есть в HTML без JS. Ссылки — обычные `<a href>`.
- **Структура URL** чистая: `/catalog/{slug}`, `/product/{slug}`, uk без префикса, `/ru`, `/en`; `/uk/*` → 308; trailing slash → 308; `www` → 301; старый `maxsolkh.shop` → 301 **с сохранением пути и query**.
- **hreflang** uk/ru/en + `x-default` на всех страницах (по разметке — правильные, взаимные), canonical самоссылающийся, на товаре нормализован к нижнему регистру.
- **robots.txt** открыт, служебные разделы закрыты, `Sitemap:` указан; управляется флагом `SITE_INDEXABLE` во время запроса.
- **Фильтры/сортировка/поиск** → `noindex, follow` (нет взрыва дублей от параметров).
- **Контент товаров:** все 223 товара имеют описания на трёх языках, uk не совпадает с ru, en без кириллицы; у всех есть фото; дублей названий нет.
- **Заголовки:** один H1 на странице, H2 для секций, H3 для карточек — логичная иерархия.
- **Хлебные крошки** видимые + `BreadcrumbList` JSON-LD на товаре (с локализованными названиями).
- **Product/Offer JSON-LD**: `price`, `priceCurrency: UAH`, `availability`, `itemCondition`, `image`, `url` — базовый набор есть.
- **Картинки:** imgproxy → WebP, `srcset`+`sizes`, кэш 1 год immutable + nginx-кэш (HIT), `fetchPriority="high"` и `preload` для первого фото товара, CLS = 0.
- **Статика Next** кэшируется `immutable` на год; `poweredByHeader: false`.
- **HTTPS везде**, HSTS год + includeSubDomains, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy`.
- **404** отдаёт реальный статус 404 (несуществующий товар, категория, путь).
- **Страницы доверия есть:** доставка/оплата, возврат (14 дней), гарантия, privacy, terms (публичная оферта), «Про магазин», реквизиты ФОП с РНОКПП на «Контактах».
- `admin.` и `demo.` закрыты от индексации.

---

## 3. План правок по шагам

### Шаг 1 — сразу (≤1 час, разблокирует индексацию)
1. `site/next.config.ts`: `htmlLimitedBots: /.*/` (проблема №1). Задеплоить и проверить:
   `curl -s -A "Googlebot" https://chisetup.com.ua/catalog/kovriki | grep -bo '</head>\|<title>\|rel="canonical"'` — title и canonical должны быть до `</head>`.
2. Скрыть пустые категории `kresla`, `stoly` (снять `showInMenu` в админке) — сразу уйдут из меню и sitemap (№2).
3. Добавить сайт в Google Search Console и Bing Webmaster (подтвердить домен через DNS), отправить `sitemap.xml`, запросить индексацию главной и категорий.

### Шаг 2 — метаданные (1–2 дня)
4. Хелпер `buildMeta(locale, path, {title, description, image})` в `site/i18n/index.ts` рядом с `alternates()`: canonical, hreflang, полный `openGraph` (url, siteName, locale, images) и `twitter`. Использовать во всех `generateMetadata` (№7).
5. Дефолтная OG-картинка `app/opengraph-image.png` 1200×630 (№7); OG товара — JPEG.
6. Шаблоны title/description для товаров и категорий + уникальные description для инфо-страниц (№3, №4, №8). Ключевые фразы в i18n:
   - uk: «ігрова мишка», «килимок для миші», «ігрова поверхня», «глайди для миші», «кейкапи», «ігровий рукав», «механічна/магнітна клавіатура», «купити», «Україна», «Харків»;
   - ru: «игровая мышь», «коврик для мыши», «глайды для мыши», «купить», «Украина», «Харьков».
7. Бэкенд: у tag поля `seoTitle`, `seoDescription`, `h1`, `intro` (с переводами), у product — `brand`; в админке — редактирование. Заполнить для 12 непустых категорий; вывести `intro` под сеткой категории (№3).

### Шаг 3 — разметка и контент (2–3 дня)
8. Product JSON-LD: настоящий `brand`, `shippingDetails`, `hasMerchantReturnPolicy`, ссылка на Organization `@id` (№5). Проверить в Rich Results Test.
9. `OnlineStore` + `WebSite` на главной; контакты — телефон/e-mail/город (№9).
10. Описание товара: «•»-строки → `<ul>`, характеристики → `<dl>` (№25).
11. Назначить категории 6 товарам (№23).

### Шаг 4 — производительность (2–3 дня)
12. ISR для uk-страниц: убрать dynamic-эффект rewrite в middleware (№10).
13. `lib/image.tsx`: `<img loading="lazy">` в SSR всегда (№6).
14. Облегчённый DTO для карточек (№14), сократить начертания Exo 2 (№16), прелоадер без минимальной задержки (№15).
15. brotli/zstd на edge, AVIF в imgproxy (№17), убрать дубли заголовков (№18).
16. Когда квота PSI восстановится — прогнать PageSpeed Insights (mobile) для `/`, `/catalog/kovriki`, `/product/attack-shark-f1-air` и сохранить результаты как точку отсчёта.

### Шаг 5 — гигиена (по ходу)
17. Пагинация индексируемая с self-canonical или `PAGE_SIZE` побольше (№11).
18. Sitemap: `<url>` на каждую локаль + x-default, lastmod категорий (№12).
19. ru/en юридические страницы: перевод или canonical на uk (№13).
20. 404-метаданные (№19), `noindex` для `app.` (№20), 301 для slug в другом регистре и прямой редирект `http://www` (№21), robots.txt для ru/en (№22).
21. Отзывы → `AggregateRating` (№26).

---

## 4. Как проверялось (для повторения)

```bash
curl -s https://chisetup.com.ua/robots.txt
curl -s https://chisetup.com.ua/sitemap.xml | grep -c "<url>"
# где метаданные: позиции </head> и <title>
curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1)" https://chisetup.com.ua/product/attack-shark-f1-air | grep -bo '</head>\|<title>'
# кэш uk vs ru
curl -sI https://chisetup.com.ua/delivery | grep -i cache-control
curl -sI https://chisetup.com.ua/ru/delivery | grep -i 'cache-control\|x-nextjs-cache'
# редиректы
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://maxsolkh.shop/catalog/kovriki?x=1
# API-данные для анализа контента
curl -s "https://chisetup.com.ua/api/public/categories?lang=uk"
curl -s "https://chisetup.com.ua/api/public/products?size=60&page=0&lang=uk"
```

---

## 5. Статус правок (ветка `seo-fixes`, 2026-10-05)

Условие владельца: сайт визуально не меняется. До и после сняты скриншоты (главная, категория, пустая категория, товар uk/ru, контакты; 1440 px и 375 px), они совпадают попиксельно. Число картинок, которые грузятся на первом экране, не изменилось.

| # | Статус | Что сделано / почему нет |
|---|---|---|
| 1 | ✅ | `htmlLimitedBots: /.*/`: title/canonical/hreflang/robots/OG в `<head>` для любого UA |
| 2 | ✅ частично | пустые категории: `noindex, follow`, из sitemap убраны (бэкенд + страховка на сайте). В меню остаются (это видимое изменение): снять `showInMenu` в админке |
| 3 | ✅ фолбэк | title/description категорий по шаблону со словарём `CATEGORY_SEO` (`site/lib/seo.ts`), с числом товаров и ценой «від». H1 и видимые тексты не трогали. **Нужны колонки** `tags.seo_title / seo_description / h1 / intro` + переводы (миграция не делалась) |
| 4 | ✅ фолбэк | title товара `{название} — {тип}, купити в Україні` (тип не дублируется, если он уже в названии); description = начало описания + цена + доставка. `seoTitle/seoDescription` из админки по-прежнему главнее |
| 5 | ✅ частично | brand: строка «Бренд: …» из описания или известный бренд в названии, иначе `brand` не выводится. `shippingDetails` (без `shippingRate`: тариф НП платит покупатель), `hasMerchantReturnPolicy` (14 дней; для «Уцінки» NotPermitted), seller → `OnlineStore @id`. **Нужно поле** `products.brand` и артикул (sku сейчас = id) |
| 6 | ✅ | `<noscript><img>` для фото вне экрана (браузер с JS его не грузит) |
| 7 | ✅ | `pageMeta()`: полный openGraph (url, site_name, locale, alternate, image) + twitter `summary_large_image` на всех страницах; `/og-image.png` 1200×630; OG-картинка товара в JPEG |
| 8 | ✅ | свои description для каталога, контактов, доставки, возврата, гарантии, privacy, terms, about |
| 9 | ✅ частично | `OnlineStore` (+logo, contactPoint = Telegram @fullfocusme, Харків/UA, return policy) + `WebSite` с `SearchAction`. Телефона и e-mail на сайте нет, их не выдумывали |
| 10 | ✅ | uk-префикс переписывается в `next.config.ts` (`beforeFiles`), middleware только редиректит → uk-страницы снова ISR (`s-maxage=60`, `x-nextjs-cache: HIT`) |
| 11 | ✅ | `?page=N` индексируется, canonical/hreflang на себя, в title «сторінка N»; фильтры и сортировка остаются noindex |
| 12 | ✅ | `<url>` на каждую локаль + x-default; lastmod категории = самый свежий её товар, главной и каталога = самый свежий товар |
| 13 | ✅ | ru/en юридические страницы: canonical → uk, в hreflang только uk + x-default, в sitemap только uk |
| 14 | ✅ | карточкам передаётся облегчённый объект (`site/lib/card.ts`): без описаний, тегов и лишних фото |
| 15, 16 | ❌ | прелоадер и начертания шрифтов: это видимые изменения, они запрещены |
| 17 | ❌ | brotli/AVIF: это edge Caddy на сервере, его нет в репозитории |
| 18 | ✅ | `proxy_hide_header` в `infra/gateway-site.conf` (одна копия CSP/XFO/nosniff/Referrer) и в `infra/nginx/nginx.conf` для `/img` (один Cache-Control) |
| 19 | ✅ | 404: свой локализованный title, один `noindex` (layout больше не шлёт `index, follow`) |
| 20 | ✅ | Mini App: `robots.txt Disallow: /`, `<meta robots noindex>`, `X-Robots-Tag` (frontend/) |
| 21 | ✅ частично | `/product/…` и `/catalog/…` с заглавными → 301 на нижний регистр (middleware) + страховочный redirect на странице товара. `http://www` в 2 хопа: это edge Caddy, его нет в репо |
| 22 | ✅ | robots.txt: служебные пути × все локали |
| 23, 24, 26 | ❌ | данные, админка, отзывы: это не код сайта |
| 25 | ❌ | разметка описания `<ul>/<dl>` меняет вид |
