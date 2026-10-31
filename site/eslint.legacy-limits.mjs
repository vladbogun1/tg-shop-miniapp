// Files that already broke a limit from ../packages/core/eslint/architecture-limits.mjs on 2026-10-29.
// They get a warning for that rule instead of an error. Do not add new files here — split the code;
// remove a file once it is back under the limit. See docs/ARCHITECTURE-CHECKS.md.
const legacy = {
  "complexity": [
    "app/[locale]/catalog/[category]/page.tsx",
    "app/[locale]/product/[slug]/page.tsx",
    "features/auth/ui/LoginView.tsx",
    "features/gift/ui/CartGiftProgress.tsx",
    "features/gift/ui/OrderGiftCase.tsx",
    "features/gift/ui/ProductGiftBanner.tsx",
    "features/catalog/ui/CatalogFilters.tsx",
    "features/catalog/ui/CatalogView.tsx",
    "features/catalog/ui/ProductCard.tsx",
    "features/chat/ui/MessageBubble.tsx",
    "features/compare/ui/CompareModal.tsx",
    "features/layout/ui/SearchBox.tsx",
    "features/preorder/ui/PreorderPanel.tsx",
    "features/preorder/ui/Waitlist.tsx",
    "features/product/ui/BuyBox.tsx",
    "features/reviews/ui/ProductReviews.tsx",
    "features/cart/validation.ts",
    "features/catalog/model/params.ts",
    "features/support/ui/NewSupportView.tsx",
    "features/support/ui/SupportQuestionForm.tsx",
    "lib/image.tsx",
  ],
  "max-lines": [
    "features/catalog/ui/CatalogFilters.tsx",
    "features/layout/ui/Header.tsx",
  ],
  "max-depth": [],
};

export default legacy;
