"use client";

/**
 * Адрес Новой Почты (окна «Получатель и доставка» и «Новый заказ»): тип (отделение / почтомат / курьер), город из
 * справочника, дальше — отделение нужного типа или улица (справочник или вручную), дом и квартира.
 */
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { Input, type InputProps } from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { npDirectoryApi } from "@/features/delivery";
import type { NpCity, NpStreet, NpWarehouse } from "../../api";
import { NP_SERVICES, type NpService, type Place, type StreetPick } from "../../model/delivery-edit";

/** Props of the «Дом» / «Квартира» inputs: `form.register(field)` in a react-hook-form, value + onChange elsewhere. */
export type HouseInput = (field: "building" | "flat") => InputProps;

export interface NpAddressState {
  city: Place | null;
  wh: Place | null;
  service: NpService;
  street: StreetPick | null;
}


function ServiceChips({ value, onChange }: { value: NpService; onChange: (v: NpService) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="field-label">Тип доставки</span>
      <div className="flex flex-wrap gap-2">
        {NP_SERVICES.map((x) => (
          <button
            key={x.value}
            type="button"
            aria-pressed={value === x.value}
            onClick={() => onChange(x.value)}
            className={cn(
              "focusable nb-press min-h-8 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors pointer-coarse:min-h-10",
              value === x.value
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StreetFields({
  cityRef,
  street,
  setStreet,
  houseInput,
}: {
  cityRef: string;
  street: StreetPick | null;
  setStreet: (s: StreetPick | null) => void;
  houseInput: HouseInput;
}) {
  const [manual, setManual] = useState(false);
  const fetchStreets = useCallback((q: string) => npDirectoryApi.streets(cityRef, q), [cityRef]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {manual ? (
        <Input
          label="Улица"
          value={street?.name ?? ""}
          onChange={(e) => setStreet(e.target.value ? { ref: null, name: e.target.value } : null)}
          autoComplete="off"
        />
      ) : (
        <Autocomplete<NpStreet>
          label="Улица"
          placeholder="Начните вводить улицу…"
          selectedLabel={street?.name ?? null}
          fetchItems={fetchStreets}
          itemKey={(x) => x.ref}
          itemLabel={(x) => [x.type, x.name].filter(Boolean).join(" ")}
          onSelect={(x) => setStreet({ ref: x.ref, name: x.name })}
          onClear={() => setStreet(null)}
        />
      )}
      <button
        type="button"
        className="hit self-start text-[12px] font-semibold text-[var(--accent-hi)] hover:underline"
        onClick={() => setManual((v) => !v)}
      >
        {manual ? "Искать по справочнику" : "Не нашли улицу? Ввести вручную"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Дом" {...houseInput("building")} autoComplete="off" />
        <Input label="Квартира" {...houseInput("flat")} autoComplete="off" />
      </div>
    </div>
  );
}

export function NpAddressFields({
  value,
  onChange,
  houseInput,
}: {
  value: NpAddressState;
  onChange: (patch: Partial<NpAddressState>) => void;
  houseInput: HouseInput;
}) {
  const { city, wh, service, street } = value;
  const cityRef = city?.ref;
  const fetchCities = useCallback((q: string) => npDirectoryApi.cities(q), []);
  const fetchWarehouses = useCallback(
    (q: string) =>
      cityRef ? npDirectoryApi.warehouses(cityRef, q, service === "POSTOMAT" ? "postomat" : "warehouse") : Promise.resolve([] as NpWarehouse[]),
    [cityRef, service],
  );
  return (
    <>
      <ServiceChips value={service} onChange={(v) => v !== service && onChange({ service: v, wh: null })} />
      <Autocomplete<NpCity>
        label="Город"
        placeholder="Начните вводить город…"
        selectedLabel={city?.name ?? null}
        fetchItems={fetchCities}
        itemKey={(c) => c.ref}
        itemLabel={(c) => c.name}
        itemSubLabel={(c) => c.area ?? ""}
        onSelect={(c) => onChange({ city: { ref: c.ref, name: c.name }, wh: null, street: null })}
        onClear={() => onChange({ city: null, wh: null })}
      />
      {city && service === "DOORS" && (
        <StreetFields cityRef={city.ref} street={street} setStreet={(s) => onChange({ street: s })} houseInput={houseInput} />
      )}
      {city && service !== "DOORS" && (
        <Autocomplete<NpWarehouse>
          key={service}
          label={service === "POSTOMAT" ? "Поштомат" : "Відділення"}
          placeholder="Номер или адрес…"
          selectedLabel={wh?.name ?? null}
          fetchItems={fetchWarehouses}
          itemKey={(w) => w.ref}
          itemLabel={(w) => w.description}
          onSelect={(w) => onChange({ wh: { ref: w.ref, name: w.description } })}
          onClear={() => onChange({ wh: null })}
        />
      )}
    </>
  );
}
