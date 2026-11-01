# packages/

Workspace-пакеты фронтов (docs/ARCHITECTURE-FRONT.md, 2.2). Потребляются как TS-исходники через `transpilePackages`, без сборки; импорты — только по явным подпутям.

| Пакет | Что | Зависит от |
|---|---|---|
| `@shop/core` (`packages/core`) | чистый TS без React: money, time, storage, errors, query, http, i18n-ядро, правила заказа/корзины/сравнения/кейса, DTO-типы | — |
| `@shop/ui` (`packages/ui`) | React-примитивы: `cn`, `tap`, `motion`, логотип (`brand/*`), UI кейса (`gift-case`) | core |
| `@shop/customer` (`packages/customer`) | общее покупательское Mini App + сайта: account, analytics, cart, catalog, chat, checkout, compare, delivery, gift, i18n, order, payment, platform, preorder, review, support | core, ui |

Пример: `import { money } from "@shop/core/money"`, `import { GiftCaseOpening } from "@shop/ui/gift-case"`. Общего барель-индекса нет (есть узкие `index.ts` у `ui/{confirm,mutation,toast}`). `@shop/core/src/api/` — OpenAPI-типы, единственное место, куда пишет `npm run gen:api`. `sideEffects: false`.
