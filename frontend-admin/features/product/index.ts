/** Публичный API фичи «товары админки»: экран, окно товара, шлюз публикации, типы, запросы. */
export { ProductsScreen } from "./ui/ProductsScreen";
export { ProductModal, type ProductStepKey } from "./ui/modal/ProductModal";
export { usePublishGate } from "./ui/PublishGate";

export { productApi } from "./api";
export { productKeys } from "./keys";
export {
  invalidateProductDerived,
  isDoubleSubmit,
  useProductsQuery,
  useSetCardStatus,
  useSetProductActive,
  useSetProductArchived,
} from "./queries";
export type { AdminProduct, AdminProductSaved, ProductWriteRequest, SpecIssue } from "./model/types";
export { ProductStateChips, useBatchProductTools, useBatchProducts } from "./ui/BatchItemProduct";
export { ProductPickModal } from "./ui/ProductPickModal";
