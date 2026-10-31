import type { SupportThread } from "@shop/core/support";

interface Product {
  title?: string | null;
  images?: { url: string | null }[] | null;
}

/** The product the thread is about: the thread's own, else the one a draft was opened from. */
function productOf(thread: SupportThread | undefined, draft: Product | undefined) {
  return {
    title: thread?.productTitle ?? draft?.title ?? null,
    image: thread?.productImageUrl ?? draft?.images?.[0]?.url ?? null,
  };
}

/** What the header shows: the product, the title and the state flags. */
export function threadHeader(
  thread: SupportThread | undefined,
  draftProduct: Product | undefined,
  isDraft: boolean,
  fallbackTitle: string,
) {
  const product = productOf(thread, draftProduct);
  const closed = thread?.status === "CLOSED";
  return {
    productTitle: product.title,
    productImage: product.image,
    title: product.title || thread?.subject || fallbackTitle,
    closed,
    canClose: !isDraft && !!thread && !closed,
  };
}
