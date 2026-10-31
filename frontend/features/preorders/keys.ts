/** Query keys of the account pre-orders screen. The list itself is `preorderKeys.mine` (lib/preorders). */
export const preorderScreenKeys = {
  /** Every per-product pre-order state (invalidated after leaving the queue). */
  products: ["preorders", "product"] as const,
};
