# packages/

Workspace-пакеты фронтов (docs/ARCHITECTURE-FRONT.md, 2.2). Потребляются как TS-исходники через `transpilePackages`, без сборки; импорты — только по явным подпутям.

| Пакет | Что | Зависит от |
|---|---|---|
| `@shop/core` (`packages/core`) | чистый TS без React: money, time, storage, errors, query, http, i18n-ядро, правила заказа/корзины/сравнения/кейса, DTO-типы | — |
| `@shop/ui` (`packages/ui`) | React-примитивы: `cn`, `tap`, `motion`, логотип (`brand/*`), UI кейса (`gift-case`) | core |
| `@shop/customer` (`packages/customer`) | общее покупательское Mini App + сайта (пусто до шага 5) | core, ui |

Пример: `import { money } from "@shop/core/money"`, `import { GiftCaseOpening } from "@shop/ui/gift-case"`. Барель-индекса нет. `sideEffects: false`.
