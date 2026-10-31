// Files that already broke a limit from ../packages/core/eslint/architecture-limits.mjs on 2026-10-29.
// They get a warning for that rule instead of an error. Do not add new files here — split the code;
// remove a file once it is back under the limit. See docs/ARCHITECTURE-CHECKS.md.
const legacy = {
  "complexity": [
    "shell/TabBar.tsx",
    "features/cart/ui/AddToCartControl.tsx",
    "features/gift/ui/CartGiftProgress.tsx",
    "features/gift/ui/OrderGiftCase.tsx",
    "features/gift/ui/ProductGiftBanner.tsx",
    "features/catalog/ui/ProductCard.tsx",
    "features/product/ui/ProductView.tsx",
    "features/chat/ui/MessageBubble.tsx",
    "features/checkout/ui/NpCombobox.tsx",
    "features/preorders/ui/PreorderBlock.tsx",
    "lib/image.tsx",
  ],
  "max-lines": [
  ],
  "max-depth": [],
};
export default legacy;
