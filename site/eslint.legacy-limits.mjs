// Files that already broke a limit from ../packages/core/eslint/architecture-limits.mjs on 2026-10-29.
// They get a warning for that rule instead of an error. Do not add new files here — split the code;
// remove a file once it is back under the limit. See docs/ARCHITECTURE-CHECKS.md.
const legacy = {
  "complexity": [
    "app/[locale]/catalog/[category]/page.tsx",
    "app/[locale]/product/[slug]/page.tsx",
    "features/auth/ui/LoginView.tsx",
    "components/case/CartGiftProgress.tsx",
    "components/case/OrderGiftCase.tsx",
    "components/case/ProductGiftBanner.tsx",
    "components/catalog/CatalogFilters.tsx",
    "components/catalog/CatalogView.tsx",
    "components/catalog/ProductCard.tsx",
    "components/chat/MessageBubble.tsx",
    "components/compare/CompareModal.tsx",
    "components/layout/SearchBox.tsx",
    "components/preorder/PreorderPanel.tsx",
    "components/preorder/Waitlist.tsx",
    "components/product/BuyBox.tsx",
    "components/reviews/ProductReviews.tsx",
    "features/cart/validation.ts",
    "features/catalog/model/params.ts",
    "features/support/ui/NewSupportView.tsx",
    "features/support/ui/SupportQuestionForm.tsx",
    "lib/image.tsx",
  ],
  "max-lines": [
    "components/catalog/CatalogFilters.tsx",
    "components/layout/Header.tsx",
  ],
  "max-depth": [],
};

export default legacy;
