"use client";

/**
 * Completion of ONE product card by any external AI — right after a product is created with only
 * a title (it is saved hidden: active=false, card DRAFT) or from the product list / «Очередь»
 * («Оформить с ИИ»). Same prompt (batch of 1), same check and the same review card as step 3 of
 * «Оформление с ИИ», plus publishing: «Сразу выложить на витрину» sends `publish` with the import;
 * when the backend refuses because the price is missing, the price is asked for inline and the
 * product is published with PATCH …/active.
 *
 * Usage: <CardCompletionModal productId={id} open={open} reason="created" onClose={(r) => …} />
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ClipboardPaste, Rocket, Save, TriangleAlert, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { buildCardReview, editText, parseCardAnswer, type Proposal, type ProductReview } from "@/lib/card-check";
import { assignCardIds, buildCardPrompt } from "@/lib/card-prompt";
import { cardsApi, type CardImportItemResult } from "@/lib/cards-api";
import { CARDS_EXPORT_KEY, invalidateCards, useCatalogSchema } from "@/lib/cards";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { CenterSpinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { CopyButton } from "@/components/translations/shared";
import { AddOptionModal } from "@/components/cards/AddOptionModal";
import { ReviewCard } from "@/components/cards/ReviewCard";
import { buildImportItem, defaultSel, mergeSel, type ProductSel } from "@/components/cards/selection";

export interface CardCompletionResult {
  saved: boolean;
  published: boolean;
}

function translatedNote(r: CardImportItemResult | undefined): string {
  const t = r?.translated;
  if (!t || t.uk + t.en === 0) return "";
  return ` · переводы UA ${t.uk} / EN ${t.en}`;
}

const HIDDEN_TOAST = "Товар сохранён скрытым. Доделать — «Карточки → Незавершённые»";

function publishProblem(r: CardImportItemResult | undefined, priceMinor: number | null | undefined): { text: string; needPrice: boolean } | null {
  if (!r || r.published) return null;
  const missing = (r.missing ?? []).map((m) => m.toLowerCase());
  const msg = r.message ?? "";
  const needPrice = missing.some((m) => m.includes("price")) || /цен|price/i.test(msg) || (r.reason === "PRODUCT_NOT_PUBLISHABLE" && !priceMinor);
  const needCategory = missing.some((m) => m.includes("categor")) || /категор|category/i.test(msg);
  if (r.reason === "CARD_NOT_READY") {
    return { text: `Карточка не готова к показу${msg ? `: ${msg}` : ""} — заполните обязательные характеристики (отметьте поля из ответа ИИ или допишите в товаре).`, needPrice: false };
  }
  const parts: string[] = [];
  if (needPrice) parts.push("не указана цена");
  if (needCategory) parts.push("не выбрана категория — примите категорию из ответа ИИ или задайте её в товаре");
  if (!parts.length) parts.push(msg || r.reason || "сервер не выложил товар");
  return { text: `Не выложено: ${parts.join("; ")}.`, needPrice };
}

export function CardCompletionModal({
  productId,
  open,
  onClose,
  reason = "manual",
}: {
  productId: string;
  open: boolean;
  onClose: (result?: CardCompletionResult) => void;
  reason?: "created" | "manual";
}) {
  const qc = useQueryClient();
  const { push } = useToast();
  const schemaQ = useCatalogSchema();
  const itemQ = useQuery({
    queryKey: [...CARDS_EXPORT_KEY, "one", productId],
    queryFn: async () => (await cardsApi.export("all", [productId])).find((i) => i.id === productId) ?? null,
    enabled: open && !!productId,
    staleTime: 0,
  });
  const item = itemQ.data ?? null;
  const schema = schemaQ.data;
  const ids = useMemo(() => assignCardIds([productId]), [productId]);
  const prompt = useMemo(() => (item && schema ? buildCardPrompt([item], schema, { part: 1, total: 1, ids }) : ""), [item, schema, ids]);

  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [review, setReview] = useState<ProductReview | null>(null);
  const [sel, setSel] = useState<ProductSel | null>(null);
  const [publish, setPublish] = useState(true);
  const [markReady, setMarkReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [problem, setProblem] = useState<{ text: string; needPrice: boolean } | null>(null);
  const [price, setPrice] = useState("");
  const [addOption, setAddOption] = useState<Proposal | null>(null);

  // Fresh state for every product the modal is opened for.
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setPreview(false);
    setAnswer("");
    setErrors([]);
    setNotes([]);
    setReview(null);
    setSel(null);
    setPublish(true);
    setMarkReady(true);
    setSaved(false);
    setPublished(false);
    setProblem(null);
    setPrice("");
  }, [open, productId]);

  function check(text = answer, keep = false) {
    if (!item || !schema) return;
    const parsed = parseCardAnswer(text);
    const errs = [...parsed.errors];
    if (!text.trim() || parsed.entries.size === 0) {
      setErrors(errs);
      setNotes(parsed.notes);
      setReview(null);
      return;
    }
    // One product: an answer under any single id is taken for it (the AI sometimes mangles the id).
    let r = buildCardReview(parsed, { schema, items: [item], ids });
    if (!r.products.length && parsed.entries.size === 1 && r.unknown.length === 1) {
      const only = parsed.entries.values().next().value;
      r = buildCardReview({ ...parsed, entries: new Map([[ids.get(productId)!, only]]) }, { schema, items: [item], ids });
      parsed.notes.push(`id «${[...parsed.entries.keys()][0]}» не совпал — ответ взят для этого товара`);
    }
    if (r.unknown.length) errs.push(`В ответе другие товары (${r.unknown.join(", ")}) — пропущены.`);
    for (const x of r.invalid) errs.push(`${x.id}: ${x.problems.join("; ")}`);
    setErrors(errs);
    setNotes(parsed.notes);
    const p = r.products[0] ?? null;
    setReview(p);
    setSel((prev) => (p ? (keep ? mergeSel(prev ?? undefined, p, { created: reason === "created" }) : defaultSel(p, { created: reason === "created" })) : null));
    setProblem(null);
  }

  const schemaRef = useRef(schema);
  useEffect(() => {
    if (schemaRef.current !== schema) {
      schemaRef.current = schema;
      if (review && answer.trim()) check(answer, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const payload = review && sel ? buildImportItem(review, sel, { markReady, model, publish }) : null;

  function close() {
    if (!saved || !published) {
      if (reason === "created" || item?.active === false) push(HIDDEN_TOAST, "info");
    }
    onClose({ saved, published });
  }

  async function save() {
    if (!payload || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await cardsApi.import({ items: [payload], replaceSpecs: false });
      const rejected = res.rejected.find((x) => x.productId === productId);
      if (rejected) {
        setProblem({ text: `Сервер не принял карточку: ${rejected.reason}`, needPrice: false });
        return;
      }
      setSaved(true);
      setReview(null);
      setAnswer("");
      const one = res.items.find((x) => x.productId === productId);
      let isPublished = !!one?.published;
      if (publish && !one) {
        // Older backend without `publish`: put it on the storefront ourselves.
        try {
          await cardsApi.setActive(productId, true);
          isPublished = true;
        } catch (e) {
          setProblem({ text: `Карточка сохранена, но не выложена: ${e instanceof ApiError ? e.message : "ошибка"}`, needPrice: !item?.priceMinor });
        }
      } else if (publish && !isPublished) {
        setProblem(publishProblem(one, item?.priceMinor));
      }
      setPublished(isPublished);
      invalidateCards(qc);
      if (isPublished) {
        push(`Карточка сохранена, товар на витрине${translatedNote(one)}`, "ok");
        onClose({ saved: true, published: true });
      } else if (!publish) {
        push(item?.active === false ? HIDDEN_TOAST : "Карточка сохранена", item?.active === false ? "info" : "ok");
        onClose({ saved: true, published: false });
      }
    } catch (e) {
      setProblem({ text: `Не удалось сохранить: ${e instanceof ApiError ? e.message : "ошибка сети"}`, needPrice: false });
    } finally {
      setSaving(false);
    }
  }

  async function saveWithPrice() {
    const uah = Number(price.replace(",", ".").replace(/\s/g, ""));
    if (!item || !Number.isFinite(uah) || uah <= 0 || saving) return;
    setSaving(true);
    try {
      // Description may have just been replaced by the import — take the current one.
      const fresh = (await cardsApi.export("all", [productId])).find((i) => i.id === productId) ?? item;
      await cardsApi.setPrice(fresh, Math.round(uah * 100));
      await cardsApi.setActive(productId, true);
      setPublished(true);
      invalidateCards(qc);
      push("Цена сохранена, товар на витрине", "ok");
      onClose({ saved: true, published: true });
    } catch (e) {
      setProblem({ text: `Не выложено: ${e instanceof ApiError ? e.message : "ошибка сети"}`, needPrice: true });
    } finally {
      setSaving(false);
    }
  }

  const loading = itemQ.isLoading || schemaQ.isLoading;

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        size="lg"
        closeOnBackdrop={false}
        dirty={!!answer.trim() && !saved}
        dirtyMessage="Ответ ИИ вставлен, но не сохранён. Закрыть без сохранения?"
        title={item ? `Оформить с ИИ: ${item.title}` : "Оформить карточку с ИИ"}
        footer={
          <div className="flex w-full flex-wrap items-center gap-3">
            {!saved && (
              <div className="min-w-[200px]">
                <Toggle checked={publish} onChange={setPublish} label="Сразу выложить на витрину" />
              </div>
            )}
            <span className="ml-auto" />
            <ModalCancel disabled={saving}>{saved ? "Готово" : "Закрыть"}</ModalCancel>
            {!saved && (
              <Button
                variant="accent"
                chamfer
                icon={publish ? <Rocket className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                loading={saving}
                disabled={!payload}
                onClick={save}
              >
                {publish ? "Сохранить и выложить" : "Сохранить"}
              </Button>
            )}
          </div>
        }
      >
        {loading ? (
          <CenterSpinner label="Загрузка товара и схемы…" />
        ) : !item || !schema ? (
          <div className="text-[13px] font-semibold text-[var(--danger-ink)]">
            ✕ {!item ? "Товар не найден." : "Не удалось загрузить схему каталога."}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {(reason === "created" || item.active === false) && !published && (
              <div className="flex gap-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn)]" />
                <div className="text-[13px] leading-relaxed text-[var(--text)]">
                  <b>Внимание: товар ещё не готов к показу.</b> Он сохранён скрытым — покупатели его не видят. Чтобы выложить, оформите
                  карточку в нашем строгом формате: категория, бренд, характеристики по схеме и описание. Скопируйте промпт в ИИ с поиском в
                  интернете (ChatGPT, Claude, Gemini…), вставьте ответ, проверьте и сохраните.
                </div>
              </div>
            )}

            {/* 1. prompt */}
            <div>
              <div className="field-label mb-2">1 · Промпт для ИИ</div>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton variant={copied || answer.trim() ? "surface" : "accent"} text={prompt} copied={copied} onCopied={() => setCopied(true)} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(!preview)}
                  iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", preview && "rotate-180")} />}
                >
                  Показать текст
                </Button>
                <span className="text-[12px] text-[var(--text-faint)]">{prompt.length.toLocaleString("ru")} симв.</span>
              </div>
              <AnimatePresence initial={false}>
                {preview && (
                  <motion.pre
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="thin-scroll mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)]"
                  >
                    {prompt}
                  </motion.pre>
                )}
              </AnimatePresence>
            </div>

            {/* 2. answer */}
            {!saved && (
              <div>
                <div className="field-label mb-2">2 · Ответ ИИ</div>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    const el = e.currentTarget;
                    const next = answer.slice(0, el.selectionStart) + pasted + answer.slice(el.selectionEnd);
                    window.setTimeout(() => check(next), 0);
                  }}
                  rows={5}
                  spellCheck={false}
                  aria-label="Ответ ИИ"
                  placeholder={'Вставьте ответ целиком — блок ```json { "p…": { … } } ```'}
                  className="thin-scroll w-full resize-y rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button variant={review || !answer.trim() ? "surface" : "accent"} size="sm" icon={<Wand2 className="h-4 w-4" />} onClick={() => check()} disabled={!answer.trim()}>
                    Проверить
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<ClipboardPaste className="h-4 w-4" />}
                    onClick={async () => {
                      try {
                        const t = await navigator.clipboard.readText();
                        setAnswer(t);
                        check(t);
                      } catch {
                        push("Браузер не дал прочитать буфер — вставьте Ctrl+V", "info");
                      }
                    }}
                  >
                    Вставить из буфера
                  </Button>
                  {answer && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X className="h-4 w-4" />}
                      onClick={() => {
                        setAnswer("");
                        setReview(null);
                        setErrors([]);
                        setNotes([]);
                      }}
                    >
                      Очистить
                    </Button>
                  )}
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Модель ИИ (необязательно)"
                    aria-label="Модель ИИ"
                    className="ml-auto h-8 w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] sm:w-[200px]"
                  />
                </div>
                {(errors.length > 0 || notes.length > 0) && (
                  <div className="mt-2 flex flex-col gap-1 text-[13px] font-semibold">
                    {errors.map((e, i) => (
                      <div key={i} className="text-[var(--danger-ink)]">✕ {e}</div>
                    ))}
                    {notes.map((n, i) => (
                      <div key={i} className="text-[var(--text-muted)]">ℹ Исправлено автоматически: {n}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. review */}
            {review && sel && (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className="field-label">3 · Проверка</span>
                  <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[var(--text-muted)]">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={markReady} onChange={(e) => setMarkReady(e.target.checked)} />
                    Отметить карточку проверенной
                  </label>
                </div>
                <ReviewCard review={review} schema={schema} sel={sel} onSel={(patch) => setSel({ ...sel, ...patch })} onAddOption={setAddOption}
                  onEditText={(field, lang, value) => setReview(editText(review, field, lang, value))}
                />
              </div>
            )}

            {saved && !published && !problem && (
              <div className="text-[13px] font-semibold text-[var(--ok)]">✓ Карточка сохранена.</div>
            )}
            {problem && (
              <div className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3">
                <div className="text-[13px] font-semibold text-[var(--danger-ink)]">✕ {problem.text}</div>
                {problem.needPrice && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="w-[180px]">
                      <Input
                        label="Укажите цену, чтобы выложить"
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        rightSlot={<span className="text-[12px] text-[var(--text-faint)]">грн</span>}
                      />
                    </div>
                    <Button variant="accent" icon={<Rocket className="h-4 w-4" />} loading={saving} disabled={!(Number(price.replace(",", ".")) > 0)} onClick={saveWithPrice}>
                      Сохранить цену и выложить
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      {addOption && (
        <AddOptionModal
          proposal={addOption}
          onClose={() => setAddOption(null)}
          onAdded={() => {
            setAddOption(null);
            invalidateCards(qc, true);
          }}
        />
      )}
    </>
  );
}
