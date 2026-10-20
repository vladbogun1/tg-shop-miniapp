# «Глухие» запуски Mini App (мост Telegram мёртв)

Октябрь 2026. ~30 % запусков Mini App на проде получали мёртвый мост Telegram: клиент не присылает
ни одного события (safe area, тема, viewport), а всё, что шлёт страница (`openLink`,
`requestFullscreen`, haptics), молча теряется. Из-за этого откатили v3.29.0 (оплата через `openLink`).

## Признак в данных

`client_events.event = 'tg_safe_area'`: `tgVars ["",""]` (CSS-переменные `--tg-safe-area-*` не
выставлены — `safe_area_changed` не пришёл) и `sa/csa [0,0]`. С этой ветки там же `px` (был ли
`TelegramWebviewProxy`), `rx` (сколько событий доставил клиент), `fe` (первое событие и мс), `host`.

## Механизм (исходники клиентов, master, окт. 2026)

Все три клиента привязывают мост к **origin URL, который запустил Telegram** (флаг сервера
`same_origin`):

- iOS `WebAppWebView.swift`: `securedEventProxySource` не определяет `window.TelegramWebviewProxy`,
  если `location.origin` ≠ доверенного; `sendEvent` и `isTrustedMainFrameMessage` молча отбрасывают.
- Android `BotWebViewContainer.java`: `onBotWebMessage` / `notifyEvent` отбрасывают, если
  `trustedOrigin` ≠ origin текущей страницы (`restrictBridgeToOrigin`).
- Desktop `attach_bot_webview.cpp`: входящие сверяются с `_initialOrigin`, исходящие обёрнуты в
  `if (this.location.origin === "<initial>")`.

Значит, любой запуск, при котором страница оказывается на другом origin (301 со старого адреса
`https://maxsolkh.shop:666` на `https://app.chisetup.com.ua`), получает мёртвый мост на всех платформах.
**Подтверждено 20.10.2026:** в BotFather у @ChiSetupShop_bot URL Main Mini App (кнопка «Open» в профиле и
списке чатов, режим Fullscreen) оставался https://maxsolkh.shop:666/. tcpdump на :666 + журнал edge
показали: SYN на :666 → через 0,8 с документ «/» на app.chisetup.com.ua с того же IP. Около 19:03 UTC
владелец сменил URL на https://app.chisetup.com.ua/. Отсюда и картина в данных: глухие только запуски
на «/» (Main Mini App), кнопки с ?startapp= почти никогда; «липкость» по человеку (привычка открывать
через «Open»); fs:true с самого начала (режим Fullscreen из initParams).

Остаточный источник: web_app-кнопки в старых сообщениях бота (до переезда v3.1.0, 05.10.2026) хранят
старый URL навсегда, поэтому :666 не должен редиректить (п. 1 ниже). В коде и базе старого адреса
нет (проверено 20.10).

## Что сделано

1. `infra/Caddyfile.prod`: `:666` больше не редиректит, а **отдаёт Mini App сам** (тот же gateway,
   Host/Origin переписаны на app.chisetup.com.ua — бэкенд видит привычный адрес). Origin запуска =
   origin страницы → мост жив.
2. `frontend/app/layout.tsx` (`TG_BRIDGE_PROBE`) + `lib/telegram.ts` (`isBridgeDead`): счётчик событий
   моста; при мёртвом мосте `openExternalLink` / `downloadFile` идут браузерным путём, а не в пустоту.
