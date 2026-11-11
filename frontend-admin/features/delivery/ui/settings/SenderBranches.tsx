"use client";

/**
 * «Отделения отправки»: список с выбором «по умолчанию» и удалением (40 px на телефоне),
 * ниже — поиск города и отделения по справочнику НП.
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Badge } from "@/components/ui/Badge";
import { npAdminApi, npDirectoryApi } from "../../api";
import { addBranch, defaultBranchRef, removeBranch } from "../../model/sender";
import type { NpBranch, SenderConfig } from "../../model/types";
import type { NpCity } from "@shop/core/types";

export function SenderBranches({ cfg, onChange }: { cfg: SenderConfig; onChange: (cfg: SenderConfig) => void }) {
  const [city, setCity] = useState<{ ref: string; name: string } | null>(null);
  const def = defaultBranchRef(cfg);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="field-label">Отделения отправки</div>
      {cfg.warehouses.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)]">Добавьте хотя бы одно отделение.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cfg.warehouses.map((w) => (
            <li key={w.ref} className="card-2 flex min-w-0 items-center gap-2.5 rounded-[var(--r-md)] px-3 py-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 pointer-coarse:py-1">
                <input
                  type="radio"
                  name="np-default-branch"
                  checked={def === w.ref}
                  onChange={() => onChange({ ...cfg, defaultWarehouseRef: w.ref })}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0 text-[13px] leading-snug">
                  <b className="font-semibold text-[var(--text)]">№{w.number}</b>{" "}
                  <span className="break-words text-[var(--text-muted)]">{w.description}</span>
                  {def === w.ref && (
                    <span className="ml-2 align-middle">
                      <Badge tone="accent">по умолчанию</Badge>
                    </span>
                  )}
                </span>
              </label>
              <button
                type="button"
                onClick={() => onChange(removeBranch(cfg, w.ref))}
                aria-label={`Убрать отделение №${w.number}`}
                title="Убрать отделение"
                className="nb-press focusable grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)] pointer-coarse:h-10 pointer-coarse:w-10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Autocomplete<NpCity>
          label="Добавить отделение: город"
          placeholder="Например, Харків…"
          selectedLabel={city?.name ?? null}
          fetchItems={(s) => npDirectoryApi.cities(s)}
          itemKey={(c) => c.ref}
          itemLabel={(c) => c.name}
          itemSubLabel={(c) => c.area ?? ""}
          onSelect={(c) => setCity({ ref: c.ref, name: c.name })}
          onClear={() => setCity(null)}
        />
        {city && (
          <Autocomplete<NpBranch>
            key={city.ref}
            label="Отделение"
            placeholder="Номер или адрес…"
            selectedLabel={null}
            fetchItems={(s) => npAdminApi.warehouses(city.ref, s)}
            itemKey={(b) => b.ref}
            itemLabel={(b) => b.description}
            onSelect={(b) => onChange(addBranch(cfg, b))}
          />
        )}
      </div>
    </div>
  );
}
