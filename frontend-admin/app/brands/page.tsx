"use client";

/**
 * «Бренды» (route "/brands"): the brand directory of catalog v2 — name, URL slug, site, number of
 * products, aliases (other spellings the AI import and «Создать „…“» recognise). Create / edit,
 * delete (products stay, without a brand) and «Объединить с…» (products and aliases move to
 * another brand — for duplicates like «Attack Shark» / «AttackShark»).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BadgeCheck, Check, ExternalLink, GitMerge, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { adminApi, ApiError, type AdminBrand } from "@/lib/api";
import { productsWord } from "@/lib/catalog-admin";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/cn";
import { staggerContainer, riseItem } from "@/lib/motion";
import { useToast } from "@/lib/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { TagInput } from "@/components/catalog/TagInput";
import { BrandCombobox, type BrandValue } from "@/components/catalog/BrandCombobox";

type Sort = "name" | "products";

interface Form {
  name: string;
  slug: string;
  website: string;
  aliases: string[];
}

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function BrandsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const q = useQuery({ queryKey: ["brands"], queryFn: adminApi.brands });
  const brands = useMemo(() => q.data ?? [], [q.data]);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("products");
  const [editing, setEditing] = useState<AdminBrand | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Form>({ name: "", slug: "", website: "", aliases: [] });
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState<AdminBrand | null>(null);
  const [mergeTarget, setMergeTarget] = useState<BrandValue>({ id: null, name: "" });
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const nq = norm(search);
    const list = brands.filter(
      (b) => !nq || norm(b.name).includes(nq) || b.slug.includes(nq) || b.aliases.some((a) => norm(a).includes(nq))
    );
    return list.sort((a, b) =>
      sort === "products" ? b.productCount - a.productCount || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)
    );
  }, [brands, search, sort]);

  const totals = useMemo(
    () => ({ withProducts: brands.filter((b) => b.productCount > 0).length, empty: brands.filter((b) => b.productCount === 0).length }),
    [brands]
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["catalog-schema"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  function openForm(b: AdminBrand | null) {
    const f = { name: b?.name ?? "", slug: b?.slug ?? "", website: b?.website ?? "", aliases: b?.aliases ?? [] };
    setEditing(b);
    setForm(f);
    setInitial(JSON.stringify(f));
    setFormOpen(true);
  }

  const dupName = brands.find(
    (b) => b.id !== editing?.id && (norm(b.name) === norm(form.name) || b.aliases.some((a) => norm(a) === norm(form.name)))
  );

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        website: form.website.trim(),
        aliases: form.aliases,
      };
      if (editing) await adminApi.updateBrand(editing.id, body);
      else await adminApi.createBrand(body);
      push(editing ? "Бренд сохранён" : "Бренд создан", "ok");
      setFormOpen(false);
      refresh();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(b: AdminBrand) {
    const ok = await confirm({
      title: `Удалить бренд «${b.name}»?`,
      message:
        b.productCount > 0
          ? `${productsWord(b.productCount)} останутся без бренда (фильтр по бренду и разметка для поиска их не увидят). Если это дубликат — лучше «Объединить».`
          : "Бренд без товаров — удаление ничего не затронет.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.deleteBrand(b.id);
      push("Бренд удалён", "ok");
      refresh();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось удалить", "error");
    }
  }

  async function merge() {
    if (!merging || !mergeTarget.id) return;
    setBusy(true);
    try {
      await adminApi.mergeBrand(merging.id, mergeTarget.id);
      push(`«${merging.name}» объединён с «${mergeTarget.name}»`, "ok");
      setMerging(null);
      refresh();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось объединить", "error");
    } finally {
      setBusy(false);
    }
  }

  const slugPreview = slugify(form.slug.trim() || form.name);

  return (
    <div>
      <PageHeader
        title="Бренды"
        subtitle="Справочник производителей: фильтр на витрине, разметка для поиска, распознавание ИИ"
        actions={
          <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
            Новый бренд
          </Button>
        }
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка брендов…">
        {brands.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title="Брендов пока нет"
            description="Добавьте бренд вручную или выберите «Создать „…“» в мастере товара — он появится здесь."
            action={
              <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
                Новый бренд
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[220px] max-w-sm flex-1">
                <Input
                  aria-label="Поиск бренда"
                  placeholder="Название, slug или алиас…"
                  icon={<Search className="h-4 w-4" />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12.5px] text-[var(--text-muted)]">
                  <b className="tabular text-[var(--text)]">{brands.length}</b> всего · <b className="tabular text-[var(--text)]">{totals.empty}</b> без товаров
                </span>
                <SegmentedControl<Sort>
                  size="sm"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "products", label: "По товарам" },
                    { value: "name", label: "А–Я" },
                  ]}
                />
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState icon={Search} title="Ничего не найдено" description="Поиск идёт по названию, slug и алиасам." />
            ) : (
              <>
                {/* Desktop: table */}
                <div className="card hidden overflow-hidden p-0 md:block">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Бренд</th>
                        <th>Slug</th>
                        <th>Сайт</th>
                        <th className="r">Товаров</th>
                        <th>Алиасы</th>
                        <th className="r" aria-label="Действия" />
                      </tr>
                    </thead>
                    <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
                      {visible.map((b) => (
                        <motion.tr key={b.id} variants={riseItem} className="group">
                          <td>
                            <button type="button" onClick={() => openForm(b)} className="focusable rounded-[var(--r-sm)] text-left font-semibold text-[var(--text)] hover:text-[var(--accent-hi)]">
                              {b.name}
                            </button>
                          </td>
                          <td className="font-mono text-[12px] text-[var(--text-muted)]">{b.slug}</td>
                          <td>
                            {b.website ? (
                              <a
                                href={b.website.startsWith("http") ? b.website : `https://${b.website}`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--accent-hi)]"
                              >
                                {hostOf(b.website)} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-[var(--text-faint)]">—</span>
                            )}
                          </td>
                          <td className="r">
                            {b.productCount > 0 ? (
                              <Link href={`/products?brand=${b.id}`} className="font-semibold hover:text-[var(--accent-hi)]">
                                {b.productCount}
                              </Link>
                            ) : (
                              <span className="text-[var(--text-faint)]">0</span>
                            )}
                          </td>
                          <td className="max-w-[320px]">
                            <Aliases list={b.aliases} />
                          </td>
                          <td className="r whitespace-nowrap">
                            <RowActions onEdit={() => openForm(b)} onMerge={() => (setMerging(b), setMergeTarget({ id: null, name: "" }))} onDelete={() => remove(b)} />
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                </div>

                {/* Phone: cards */}
                <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2.5 md:hidden">
                  {visible.map((b) => (
                    <motion.li key={b.id} variants={riseItem} className="card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => openForm(b)} className="min-w-0 text-left">
                          <div className="truncate text-[15px] font-semibold text-[var(--ink)]">{b.name}</div>
                          <div className="truncate font-mono text-[11.5px] text-[var(--text-faint)]">
                            {b.slug}
                            {b.website ? ` · ${hostOf(b.website)}` : ""}
                          </div>
                        </button>
                        <span className="tabular shrink-0 text-[13px] font-semibold text-[var(--text-muted)]">{productsWord(b.productCount)}</span>
                      </div>
                      {b.aliases.length > 0 && (
                        <div className="mt-2">
                          <Aliases list={b.aliases} />
                        </div>
                      )}
                      <div className="mt-2 flex justify-end border-t border-[var(--line)] pt-2">
                        <RowActions onEdit={() => openForm(b)} onMerge={() => (setMerging(b), setMergeTarget({ id: null, name: "" }))} onDelete={() => remove(b)} />
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              </>
            )}
          </>
        )}
      </QueryState>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        closeOnBackdrop={false}
        dirty={formOpen && JSON.stringify(form) !== initial}
        title={editing ? `Бренд · ${editing.name}` : "Новый бренд"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Отмена
            </Button>
            <Button variant="accent" loading={saving} disabled={!form.name.trim()} icon={<Check className="h-4 w-4" />} onClick={save}>
              {editing ? "Сохранить" : "Создать"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Название"
            autoFocus
            value={form.name}
            maxLength={128}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Например, Attack Shark"
            error={dupName ? `Уже есть: «${dupName.name}»${norm(dupName.name) !== norm(form.name) ? " (алиас)" : ""}` : undefined}
          />
          <Input
            label="Slug"
            value={form.slug}
            className="font-mono"
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder={slugify(form.name) || "из названия"}
            hint={`В адресах фильтров: /catalog?brand=${slugPreview || "…"}`}
          />
          <Input
            label="Сайт производителя"
            value={form.website}
            maxLength={255}
            inputMode="url"
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://…"
            hint="Источник для ИИ при оформлении карточек."
          />
          <div className="flex flex-col gap-1.5">
            <span className="field-label">Алиасы</span>
            <TagInput
              ariaLabel="Алиасы бренда"
              value={form.aliases}
              onChange={(v) => setForm({ ...form, aliases: v })}
              placeholder="AttackShark, Attack-Shark, атак шарк…"
            />
            <span className="text-[12px] text-[var(--text-faint)]">
              Другие написания: по ним бренд узнаётся в ответах ИИ и при создании товара. Enter или запятая — добавить.
            </span>
          </div>
          {editing && (
            <p className="text-[12px] text-[var(--text-faint)]">
              {editing.productCount > 0 ? `У бренда ${productsWord(editing.productCount)}.` : "У бренда пока нет товаров."}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!merging}
        onClose={() => setMerging(null)}
        size="sm"
        title={`Объединить «${merging?.name ?? ""}»`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMerging(null)} disabled={busy}>
              Отмена
            </Button>
            <Button variant="accent" loading={busy} disabled={!mergeTarget.id} icon={<GitMerge className="h-4 w-4" />} onClick={merge}>
              Объединить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <BrandCombobox
            label="С каким брендом"
            brands={brands}
            value={mergeTarget}
            onChange={setMergeTarget}
            allowCreate={false}
            exclude={merging ? [merging.id] : []}
          />
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            {merging && merging.productCount > 0 ? `${productsWord(merging.productCount)} перейдут` : "Товары перейдут"} к{" "}
            {mergeTarget.name ? <b className="text-[var(--text)]">«{mergeTarget.name}»</b> : "выбранному бренду"}, а «{merging?.name}» станет
            его алиасом. Бренд «{merging?.name}» будет удалён.
          </p>
        </div>
      </Modal>
      {confirmUi}
    </div>
  );
}

function Aliases({ list }: { list: string[] }) {
  if (!list.length) return <span className="text-[var(--text-faint)]">—</span>;
  const shown = list.slice(0, 4);
  return (
    <span className="flex flex-wrap gap-1" title={list.join(", ")}>
      {shown.map((a) => (
        <span key={a} className="rounded-[var(--r-sm)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[11.5px] text-[var(--text-muted)]">
          {a}
        </span>
      ))}
      {list.length > shown.length && <span className="px-1 text-[11.5px] text-[var(--text-faint)]">+{list.length - shown.length}</span>}
    </span>
  );
}

function RowActions({ onEdit, onMerge, onDelete }: { onEdit: () => void; onMerge: () => void; onDelete: () => void }) {
  const btn =
    "focusable grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] pointer-coarse:h-10 pointer-coarse:w-10";
  return (
    <span className="inline-flex items-center gap-0.5">
      <button type="button" className={btn} aria-label="Изменить" title="Изменить" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" className={btn} aria-label="Объединить с…" title="Объединить с…" onClick={onMerge}>
        <GitMerge className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={cn(btn, "hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] hover:text-[var(--danger-ink)]")}
        aria-label="Удалить"
        title="Удалить"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}
