import { apiGet } from "@/lib/http";
import type { WriteoffRange, WriteoffReport } from "./model/types";

export const inventoryApi = {
  report: (range: WriteoffRange) => apiGet<WriteoffReport>(`/api/admin/stock-writeoffs?range=${range}`),
};
