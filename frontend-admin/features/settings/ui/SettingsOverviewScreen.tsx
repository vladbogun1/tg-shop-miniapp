"use client";

/**
 * Настройки (route "/settings"): обзор разделов (на телефоне — список как «Настройки» iPhone) и поиск по всем полям
 * всех разделов; найденное ведёт на страницу раздела к самому полю. Старые якоря (`/settings#group-<id>`, `#site`)
 * уводят на страницу раздела. Секреты и инфраструктуру (.env) API не отдаёт вообще.
 */
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { NP_PANELS } from "@/features/delivery";
import { useIsSuperAdmin } from "@/features/staff";
import { npPanelHits, settingHits, type SettingHit } from "../model/global-search";
import { legacyAnchorTarget, NP_GROUP, visibleSections } from "../model/sections";
import { useSettingsQuery } from "../queries";
import { SectionList } from "./SectionNav";

export function SettingsOverviewScreen() {
  const router = useRouter();
  const q = useSettingsQuery();
  const superAdmin = useIsSuperAdmin();
  const [query, setQuery] = useState("");

  // «К настройкам» из старых ссылок: /settings#group-novaposhta → /settings/delivery.
  useEffect(() => {
    const to = legacyAnchorTarget(window.location.hash);
    if (to) router.replace(to);
  }, [router]);

  const sections = useMemo(() => visibleSections((q.data?.groups ?? []).map((g) => g.id), superAdmin), [q.data, superAdmin]);
  const hits = useMemo(() => {
    const npTitle = q.data?.groups.find((g) => g.id === NP_GROUP)?.title;
    return [...settingHits(q.data?.items ?? [], query), ...npPanelHits(NP_PANELS, query, npTitle)];
  }, [q.data, query]);
  const searching = query.trim() !== "";

  return (
    <div className="min-w-0 max-w-[760px]">
      <PageHeader
        title="Настройки"
        subtitle="Параметры магазина, которые меняются сразу. Пароли и ключи сервисов здесь не показываются — их меняет разработчик на сервере."
      />
      <div className="mb-5 max-w-[420px]">
        <Input aria-label="Поиск по настройкам" placeholder="Найти настройку" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
      </div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка настроек">
        {searching ? <SearchResults query={query.trim()} hits={hits} /> : <SectionList sections={sections} />}
      </QueryState>
    </div>
  );
}

function SearchResults({ query, hits }: { query: string; hits: SettingHit[] }) {
  if (hits.length === 0) return <p className="panel p-5 text-[13px] text-[var(--text-muted)]">По запросу «{query}» настроек нет.</p>;
  return (
    <ul aria-label="Найденные настройки" className="panel min-w-0 divide-y divide-[var(--line)] overflow-hidden !p-0">
      {hits.map((h) => (
        <li key={h.key}>
          <Link href={h.href} className="focusable flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)] pointer-coarse:min-h-14">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-[var(--text)]">{h.label}</span>
              <span className="mt-0.5 block text-[12px] text-[var(--text-muted)]">{h.section}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
