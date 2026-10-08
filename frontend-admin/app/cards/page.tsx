"use client";

/**
 * Product cards (route "/cards") — docs/CATALOG-SPECS.md §4–5. The typed characteristics of a
 * product are filled by ANY external AI with web search: the admin copies our prompt (format +
 * category schema + current product data), pastes the answer, reviews what changes field by field
 * with the AI's confidence, and imports. Card status DRAFT → AI_FILLED → READY is a work queue of
 * the admin only; it does not affect the storefront.
 *
 *  - «Оформление с ИИ»: selection → prompt in batches → answer → review → import.
 *  - «Очередь»: cards by status with a jump into the product and a quick «Проверено».
 */
import { motion } from "framer-motion";
import { CheckCheck, ClipboardCheck, EyeOff, FilePen, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { assignCardIds } from "@/lib/card-prompt";
import { pendingCards, useCardItems, useCardStats, useCatalogSchema } from "@/lib/cards";
import { staggerContainer } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CenterSpinner } from "@/components/ui/Spinner";
import { StatCard } from "@/components/ui/StatCard";
import { AiCards } from "@/components/cards/AiCards";
import { CardQueue } from "@/components/cards/CardQueue";

type Tab = "ai" | "queue";

export default function CardsPage() {
  const [tab, setTab] = useState<Tab>("ai");
  const statsQ = useCardStats();
  const itemsQ = useCardItems();
  const schemaQ = useCatalogSchema();
  const stats = statsQ.data;
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  // Ids over ALL products: the same product keeps its "p…" id whatever is selected.
  const ids = useMemo(() => assignCardIds(items.map((i) => i.id)), [items]);
  // «На витрине без оформления»: DRAFT cards already on sale.
  const draftActive = useMemo(() => items.filter((i) => (i.cardStatus ?? "DRAFT") === "DRAFT" && i.active === true).length, [items]);
  const fetching = itemsQ.isFetching || schemaQ.isFetching || statsQ.isFetching;

  return (
    <div>
      <PageHeader
        title="Карточки"
        subtitle="Характеристики, бренд, категория и описание товаров — по данным любой ИИ с поиском в интернете. Статус карточки виден только в админке."
        actions={
          <Button
            variant="outline"
            icon={<RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            onClick={() => {
              itemsQ.refetch();
              schemaQ.refetch();
              statsQ.refetch();
            }}
          >
            Обновить
          </Button>
        }
      />

      {stats && (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Незавершённые (скрыты)" rawValue={stats.unfinished} icon={EyeOff} accent="var(--warn)" hint="не продаются, пока не оформлены" />
          <StatCard label="На витрине без оформления" rawValue={draftActive} icon={FilePen} accent="var(--text-muted)" hint="продаются, характеристик нет" />
          <StatCard label="От ИИ — ждут проверки" rawValue={stats.aiFilled} icon={Sparkles} accent="var(--info)" hint="проверьте в «Очереди»" />
          <StatCard label="Проверены" rawValue={stats.ready} icon={CheckCheck} accent="var(--ok)" hint={stats.incomplete ? `неполных: ${stats.incomplete}` : undefined} />
        </motion.div>
      )}

      <SegmentedControl<Tab>
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "ai", label: "Оформление с ИИ" },
          { value: "queue", label: "Очередь", count: pendingCards(stats) || undefined },
        ]}
      />

      {itemsQ.isLoading || schemaQ.isLoading ? (
        <CenterSpinner label="Загрузка товаров и схемы…" />
      ) : itemsQ.isError ? (
        <EmptyState icon={ClipboardCheck} title="Не удалось загрузить товары" description="Проверьте соединение и нажмите «Обновить»." />
      ) : (
        <>
          {/* Both stay mounted: switching tabs must not drop a pasted answer or the selection. */}
          <div hidden={tab !== "ai"}>
            {schemaQ.data ? (
              <AiCards items={items} schema={schemaQ.data} ids={ids} />
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                title="Не удалось загрузить схему каталога"
                description="Без схемы категорий и характеристик промпт не собрать. Нажмите «Обновить»."
              />
            )}
          </div>
          <div hidden={tab !== "queue"}>
            <CardQueue items={items} schema={schemaQ.data} />
          </div>
        </>
      )}
    </div>
  );
}
