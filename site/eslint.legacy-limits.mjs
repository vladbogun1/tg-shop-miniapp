// Files that already broke a limit from ../packages/core/eslint/architecture-limits.mjs on 2026-10-29.
// They get a warning for that rule instead of an error. Do not add new files here — split the code;
// remove a file once it is back under the limit. See docs/ARCHITECTURE-CHECKS.md.
// Step 7b (2026-10-31): max-lines is empty; what is left is function complexity (JSX with many branches:
// BuyBox, ProductCard, CartGiftProgress, ProductPage…), a rewrite of those would change markup — step 8.
const legacy = {
  "complexity": [
    "app/[locale]/catalog/[category]/page.tsx",
    "app/[locale]/product/[slug]/page.tsx",
    "features/auth/ui/LoginView.tsx",
    "features/cart/validation.ts",
    "features/catalog/model/params.ts",
    "features/catalog/ui/CatalogView.tsx",
    "features/catalog/ui/ProductCard.tsx",
    "features/chat/ui/MessageBubble.tsx",
    "features/compare/ui/CompareModal.tsx",
    "features/gift/ui/CartGiftProgress.tsx",
    "features/gift/ui/ProductGiftBanner.tsx",
    "features/layout/ui/SearchBox.tsx",
    "features/preorder/ui/PreorderPanel.tsx",
    "features/preorder/ui/Waitlist.tsx",
    "features/product/ui/BuyBox.tsx",
    "features/reviews/ui/ProductReviews.tsx",
    "features/support/ui/NewSupportView.tsx",
    "features/support/ui/SupportQuestionForm.tsx",
    "lib/image.tsx",
  ],
  "max-lines": [],
  "max-depth": [],
};

export default legacy;
