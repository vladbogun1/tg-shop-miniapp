"use client";

/**
 * Страница раздела настроек (route "/settings/<раздел>"): на ПК слева внутреннее меню разделов (sticky), справа
 * содержимое; на телефоне — только содержимое и «‹ Настройки». «Сохранить» считает и сохраняет только поля этого
 * раздела (одним запросом); с несохранёнными правками уход — в том числе в соседний раздел — спрашивает.
 * Неизвестный раздел → обзор; раздел, которого у этого админа нет (без финансов — «ИИ»), → обзор после загрузки.
 */
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { CenterSpinner } from "@/components/ui/Spinner";
import { useIsSuperAdmin } from "@/features/staff";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { isKnownSection, OTHER_SECTION, SECTIONS, visibleSections, type SettingsSection } from "../model/sections";
import { useSettingsQuery } from "../queries";
import { SaveBar } from "./SaveBar";
import { SectionContent } from "./SectionContent";
import { SectionNav } from "./SectionNav";
import { useSectionTarget } from "./use-section-target";
import { useSettingsForm } from "./use-settings-form";

export function SettingsSectionScreen({ id }: { id: string }) {
  // useSearchParams (вкладка в адресе) требует Suspense вокруг себя.
  return (
    <Suspense fallback={<CenterSpinner label="Загрузка настроек" />}>
      <SectionScreen id={id} />
    </Suspense>
  );
}

/** Какие разделы видны и есть ли среди них этот; `gone` — раздела точно нет (можно уводить на обзор). */
function useSection(id: string) {
  const q = useSettingsQuery();
  const superAdmin = useIsSuperAdmin();
  const groupIds = useMemo(() => (q.data?.groups ?? []).map((g) => g.id), [q.data]);
  const sections = useMemo(() => visibleSections(groupIds, superAdmin), [groupIds, superAdmin]);
  const listed = sections.find((s) => s.id === id);
  // «Админы» до ответа об учётке: экран сам покажет загрузку или «только для главного админа».
  const section: SettingsSection | undefined = listed ?? (id === "admins" && superAdmin === undefined ? SECTIONS.find((s) => s.id === id) : undefined);
  const gone = !isKnownSection(id) || (!section && (id === "admins" ? superAdmin === false : !!q.data));
  return { q, sections, section, gone };
}

function SectionScreen({ id }: { id: string }) {
  const router = useRouter();
  const { q, sections, section, gone } = useSection(id);
  useEffect(() => {
    if (gone) router.replace("/settings");
  }, [gone, router]);

  const items = useMemo(() => (q.data?.items ?? []).filter((it) => section?.groups.includes(it.group)), [q.data, section]);
  const scope = useMemo(() => new Set(items.map((it) => it.key)), [items]);
  const form = useSettingsForm(scope);
  const target = useSectionTarget(items, Boolean(q.data));
  const [paymentDirty, setPaymentDirty] = useState(false);
  // Один guard на страницу: у «Оплаты» правки способов оплаты и полей — разные формы, а вопрос — один.
  useUnsavedGuard(form.dirtyItems.length > 0 || paymentDirty);

  const meta = section ?? SECTIONS.find((s) => s.id === id);
  const needsSettings = id === OTHER_SECTION || (meta?.groups.length ?? 0) > 0;
  // Порядок карточек — как в описании раздела (`SECTIONS`), а не как отдал сервер.
  const groups = section ? section.groups.flatMap((id) => (q.data?.groups ?? []).filter((g) => g.id === id)) : [];

  return (
    <div className="min-w-0 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside className="hidden min-w-0 lg:sticky lg:top-[88px] lg:block">
        <SectionNav sections={sections} current={id} />
      </aside>
      <div className="min-w-0">
        <Link href="/settings" className="focusable mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--accent)] pointer-coarse:min-h-11 lg:hidden">
          <ChevronLeft className="h-4 w-4" />
          Настройки
        </Link>
        {meta && (
          <div className="mb-4 lg:mb-5">
            <h1 className="page-title text-[22px] leading-tight lg:text-[26px]">{meta.title}</h1>
            <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)] lg:text-[14px]">{meta.description}</p>
          </div>
        )}
        {section && (
          <QueryState isLoading={needsSettings && q.isLoading} isError={needsSettings && q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка настроек">
            <SectionContent
              section={section}
              groups={groups}
              items={items}
              form={form}
              tab={target.tab}
              onTab={target.setTab}
              focusKey={target.focusKey}
              onPaymentDirty={setPaymentDirty}
            />
          </QueryState>
        )}
        {!section && !gone && (
          <QueryState isLoading={!q.isError} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка настроек">
            {null}
          </QueryState>
        )}
        <SaveBar
          count={form.dirtyItems.length}
          invalid={form.invalid}
          saving={form.saving}
          onDiscard={form.discard}
          onSave={form.submit}
          onShow={() => form.dirtyItems[0] && target.show(form.dirtyItems[0])}
        />
      </div>
    </div>
  );
}
