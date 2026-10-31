import { buildCsv, csvFileName } from "../../model/registry";
import type { GiftRegistry } from "../../model/types";

/** Saves the registry as a CSV file (the browser's download). */
export function downloadCsv(data: GiftRegistry) {
  const blob = new Blob([buildCsv(data)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFileName(data);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
