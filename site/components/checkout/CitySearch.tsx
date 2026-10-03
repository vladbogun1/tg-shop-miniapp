"use client";

/**
 * City search that jumps the Nova Poshta map to the chosen city. The map itself stays the way to
 * pick a branch (as in the Mini App); this only saves the pan-and-zoom across Ukraine.
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { useId, useState } from "react";
import type { NpCity } from "@shop/shared";
import { useT } from "@/i18n/context";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { MapFocus } from "./NpWarehouseMap";

export function CitySearch({ onFocus }: { onFocus: (f: MapFocus, city: NpCity) => void }) {
  const t = useT();
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const term = useDebounced(q.trim(), 300);
  const { data = [], isFetching } = useQuery({
    queryKey: ["np-cities", term],
    enabled: term.length >= 2,
    staleTime: 5 * 60_000,
    queryFn: () => api.npCities(term),
  });
  const items = term.length >= 2 ? data.slice(0, 8) : [];

  async function pick(c: NpCity) {
    setQ(c.name);
    setOpen(false);
    setBusy(true);
    try {
      const whs = await api.npWarehouses(c.ref);
      const pts = whs.filter((w) => typeof w.lat === "number" && typeof w.lng === "number");
      if (pts.length > 0) {
        const lats = pts.map((w) => w.lat as number);
        const lngs = pts.map((w) => w.lng as number);
        onFocus(
          {
            key: Date.now(),
            bounds: [
              [Math.min(...lats), Math.min(...lngs)],
              [Math.max(...lats), Math.max(...lngs)],
            ],
          },
          c
        );
      }
    } catch {
      /* the map still works by hand */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="nb-up mb-1.5 block text-[12px] font-black text-[var(--faint)]">
        {t("checkout.city")}
      </label>
      <div className="flex h-12 items-center gap-2 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
        <MapPin className="h-4 w-4 shrink-0 text-[var(--muted)]" strokeWidth={2.75} />
        <input
          id={id}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const c = items[active >= 0 ? active : 0];
              if (c) void pick(c);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={t("checkout.cityPlaceholder")}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
        />
        {(isFetching || busy) && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--muted)]" />}
      </div>
      {open && term.length >= 2 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute inset-x-0 top-full z-[1100] mt-1.5 max-h-72 overflow-y-auto rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] shadow-[5px_5px_0_var(--shadow)]"
        >
          {items.length === 0 && !isFetching && (
            <li className="px-3 py-2.5 text-[13px] font-bold text-[var(--muted)]">{t("checkout.cityNone")}</li>
          )}
          {items.map((c, i) => (
            <li key={c.ref} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(c)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--surface-2)] ${
                  i === active ? "bg-[var(--surface-2)]" : ""
                }`}
              >
                <span className="text-[14px] font-bold text-[var(--ink)]">{c.name}</span>
                {c.area && <span className="text-[12px] font-medium text-[var(--muted)]">{c.area}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
