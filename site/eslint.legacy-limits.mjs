// Files that already broke a limit from ../packages/core/eslint/architecture-limits.mjs on 2026-10-29.
// They get a warning for that rule instead of an error. Do not add new files here — split the code;
// remove a file once it is back under the limit. See docs/ARCHITECTURE-CHECKS.md.
const legacy = {
  "complexity": [
    "app/[locale]/catalog/[category]/page.tsx",
    "app/[locale]/product/[slug]/page.tsx",
    "components/account/OrderDetailView.tsx",
    "components/auth/LoginView.tsx",
    "components/case/CartGiftProgress.tsx",
    "components/case/OrderGiftCase.tsx",
    "components/case/ProductGiftBanner.tsx",
    "components/catalog/CatalogFilters.tsx",
    "components/catalog/CatalogView.tsx",
    "components/catalog/ProductCard.tsx",
    "components/chat/MessageBubble.tsx",
    "components/checkout/CheckoutView.tsx",
    "components/compare/CompareModal.tsx",
    "components/layout/SearchBox.tsx",
    "components/order/Payment.tsx",
    "components/preorder/PreorderPanel.tsx",
    "components/preorder/Waitlist.tsx",
    "components/product/BuyBox.tsx",
    "components/reviews/ProductReviews.tsx",
    "components/support/NewSupportView.tsx",
    "components/support/SupportQuestionForm.tsx",
    "lib/cart-validation.ts",
    "lib/catalog-params.ts",
    "lib/image.tsx",
  ],
  "max-lines": [
    "components/account/OrderDetailView.tsx",
    "components/catalog/CatalogFilters.tsx",
    "components/checkout/CheckoutView.tsx",
    "components/layout/Header.tsx",
    "components/order/Payment.tsx",
    "components/support/SupportChat.tsx",
  ],
  "max-depth": [],
};

export default legacy;
