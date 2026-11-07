"use client";

import { Button } from "@shop/ui/admin-button";
import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import type { AiSearchProvider, AiState } from "../api";
import { usdFromMicro } from "../model/format";
import { useAiState, useSearchTest } from "../queries";

const SAMPLE_QUERY = "Lamzu Atlantis Mini V2 вес";

function providerTone(p: AiSearchProvider): "ok" | "warn" | "neutral" {
  if (!p.enabled) return "neutral";
  return p.coolingDown ? "warn" : "ok";
}

function providerNote(p: AiSearchProvider): string {
  if (!p.enabled) return "выключен";
  return p.coolingDown ? "перерыв после отказа" : "работает";
}

/** «Поиск»: состояние поисковых провайдеров и бесплатного лимита Serper, кнопка «Проверить поиск»; выключатель платного — в полях. */
export function AiSearchBlock({ fields }: { fields: ReactNode }) {
  const state = useAiState().data;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {state && <Providers s={state} />}
      {fields}
      <SearchTest />
    </div>
  );
}

function Providers({ s }: { s: AiState }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ul className="flex flex-wrap gap-2">
        {s.providers.map((p) => (
          <li key={p.name}>
            <Badge tone={providerTone(p)} dot>
              {p.name}: {providerNote(p)}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-snug text-[var(--text-muted)]">
        Serper: использовано {s.serper.used} из {s.serper.free} бесплатных запросов в месяц.{" "}
        {s.serper.paidAllowed ? "Платный поиск разрешён." : "Платный поиск выключен."}
      </p>
    </div>
  );
}

function SearchTest() {
  const [query, setQuery] = useState(SAMPLE_QUERY);
  const test = useSearchTest();
  const found = test.data;
  const run = () => {
    if (query.trim() !== "") test.mutate(query.trim());
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Input label="Пробный запрос" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={300} />
        </div>
        <Button variant="outline" icon={<Search className="h-4 w-4" />} loading={test.isPending} disabled={query.trim() === ""} onClick={run}>
          Проверить поиск
        </Button>
      </div>
      {found && (
        <div className="min-w-0 text-[12px] leading-snug text-[var(--text-muted)]">
          {found.hits.length === 0 ? "Ничего не нашлось." : `Нашлось: ${found.hits.length}`}
          {found.provider ? ` · провайдер ${found.provider}` : ""}
          {found.costMicroUsd > 0 ? ` · ${usdFromMicro(found.costMicroUsd)}` : " · бесплатно"}
          <ul className="mt-2 flex min-w-0 flex-col gap-1">
            {found.hits.slice(0, 3).map((h) => (
              <li key={h.url} className="min-w-0 truncate text-[var(--text)]">
                {h.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
