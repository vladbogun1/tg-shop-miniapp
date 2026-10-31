import type { LooseT } from "@shop/core/i18n";
import type { NpWarehouse } from "@/lib/api";

/** How Nova Poshta is picked: by text (city → branch fields, the default) or on the map. */
export type NpMode = "text" | "map";

export function npLabel(w: NpWarehouse, t: LooseT): string {
  const cat = t(
    w.category === "POSTOMAT"
      ? "np.type.postomat"
      : w.category === "POINT"
        ? "np.type.point"
        : "np.type.branch"
  );
  return w.number != null ? `${cat} ${t("np.number", { n: w.number })}` : cat;
}
