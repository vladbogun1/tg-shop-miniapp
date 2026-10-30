// Files that already broke a limit from ../packages/core/eslint/architecture-limits.mjs on 2026-10-29.
// They get a warning for that rule instead of an error. Do not add new files here — split the code;
// remove a file once it is back under the limit. See docs/ARCHITECTURE-CHECKS.md.
const legacy = {
  "complexity": [
    "app/account/orders/[id]/chat/page.tsx",
    "app/account/orders/[id]/page.tsx",
    "app/account/page.tsx",
    "app/account/preorders/page.tsx",
    "app/account/reviews/page.tsx",
    "app/account/support/[id]/chat/page.tsx",
    "app/checkout/page.tsx",
    "app/page.tsx",
    "components/TabBar.tsx",
    "components/account/OrderPayment.tsx",
    "components/case/CartGiftProgress.tsx",
    "components/case/OrderGiftCase.tsx",
    "components/case/ProductGiftBanner.tsx",
    "components/catalog/AddToCartControl.tsx",
    "components/catalog/FilterSheet.tsx",
    "components/catalog/ProductCard.tsx",
    "components/catalog/ProductView.tsx",
    "components/chat/MessageBubble.tsx",
    "components/checkout/NpCombobox.tsx",
    "components/preorder/PreorderBlock.tsx",
    "lib/image.tsx",
    "lib/telegram.ts",
  ],
  "max-lines": [
    "app/account/orders/[id]/chat/page.tsx",
    "app/account/orders/[id]/page.tsx",
    "app/account/support/[id]/chat/page.tsx",
    "app/checkout/page.tsx",
    "app/page.tsx",
    "components/catalog/FilterSheet.tsx",
    "components/compare/CompareSheet.tsx",
  ],
  "max-depth": [],
};

export default legacy;
