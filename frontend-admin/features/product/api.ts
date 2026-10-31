/**
 * Товары админки. Единственное место путей `/api/admin/products*` и `/api/admin/uploads`.
 * Ответы — `Schemas["AdminProductDto"]`, приведённые к виду экрана (`fromAdminProductDto`).
 */
import type { Schemas } from "@shop/core/api/schemas";
import type { CardStatus } from "@shop/core/catalog";
import { apiGet, apiPatch, apiPost, uploadFile } from "@/lib/http";
import { fromAdminProductDto } from "./model/from-dto";
import type { AdminProduct, AdminProductDto, AdminProductSaved, ProductWriteRequest } from "./model/types";

const forceQuery = (force: boolean) => (force ? "?force=1" : "");

export const productApi = {
  /** Не архивные. */
  list: async (): Promise<AdminProduct[]> => (await apiGet<AdminProductDto[]>("/api/admin/products")).map(fromAdminProductDto),
  listArchived: async (): Promise<AdminProduct[]> =>
    (await apiGet<AdminProductDto[]>("/api/admin/products/archived")).map(fromAdminProductDto),
  create: async (body: ProductWriteRequest): Promise<AdminProductSaved> =>
    fromAdminProductDto(await apiPost<AdminProductDto>("/api/admin/products", body)),
  /** `force`: выложить (active=true) карточку, которая ещё не оформлена (иначе 409 CARD_NOT_READY). */
  update: async (id: string, body: ProductWriteRequest, force = false): Promise<AdminProductSaved> =>
    fromAdminProductDto(await apiPatch<AdminProductDto>(`/api/admin/products/${id}${forceQuery(force)}`, body)),
  /** «Отметить проверенной» / «Вернуть в черновик». */
  setCardStatus: async (id: string, status: CardStatus): Promise<AdminProduct> => {
    const body: Schemas["CardStatusRequest"] = { status };
    return fromAdminProductDto(await apiPatch<AdminProductDto>(`/api/admin/products/${id}/card-status`, body));
  },
  /**
   * Включить карточку-ЧЕРНОВИК → 409 CARD_NOT_READY (если не `force`); нет цены / категории →
   * 409 PRODUCT_NOT_PUBLISHABLE.
   */
  setActive: async (id: string, active: boolean, force = false): Promise<AdminProduct> =>
    fromAdminProductDto(await apiPatch<AdminProductDto>(`/api/admin/products/${id}/active${forceQuery(force)}`, { active })),
  setArchived: async (id: string, archived: boolean): Promise<AdminProduct> =>
    fromAdminProductDto(await apiPatch<AdminProductDto>(`/api/admin/products/${id}/archived`, { archived })),
  /** Фото товара → ключ для `imageKeys`. */
  uploadPhoto: (file: File) => uploadFile("/api/admin/uploads", file),
};
