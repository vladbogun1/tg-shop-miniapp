"use client";

/**
 * Окно товара (ChiSetup v3).
 *
 * СОЗДАНИЕ — короткая форма: обязательно только название; фото, цена и остаток необязательны. Бэкенд сохраняет
 * товар скрытым с карточкой DRAFT; страница товаров сразу открывает CardCompletionModal («Оформить с ИИ»).
 *
 * ПРАВКА — мастер по шагам: 1) Основное → 2) Фото → 3) Цена и склад → 4) Категория (листовая категория,
 * бренд, состояние, «На витрине») → 5) Характеристики (форма по схеме категории, уверенность ИИ, статус карточки)
 * → 6) Сайт (slug, SEO, SKU) → 7) Проверка. «Сохранить» работает с любого шага; закрытие с несохранёнными
 * правками спрашивает.
 * Остаток уходит только если админ его менял, вместе со значением, с которым открыли форму (expectedStock) —
 * сервер отвечает 409 STOCK_CONFLICT, если заказы сдвинули его за это время.
 * Включение «На витрине» у карточки-ЧЕРНОВИКА идёт через шлюз публикации (PublishGate).
 */
import Link from "next/link";
import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "@shop/ui/toast";
import { Modal } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { plural } from "@/features/catalog";
import { stepError, stepValid } from "../../model/form";
import { S, STEPS, type ProductStepKey } from "../../model/steps";
import type { AdminProduct } from "../../model/types";
import { CreateProductModal } from "./CreateProductModal";
import { Stepper } from "./Stepper";
import { Warning } from "./parts";
import { BasicsStep } from "./steps/BasicsStep";
import { CategoryStep } from "./steps/CategoryStep";
import { PhotosStep } from "./steps/PhotosStep";
import { PricingStep } from "./steps/PricingStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SiteStep } from "./steps/SiteStep";
import { SpecsStep } from "./steps/SpecsStep";
import type { ProductCtx } from "./ctx";
import { useProductDerived } from "./use-product-derived";
import { useProductForm } from "./use-product-form";
import { useProductSave } from "./use-product-save";

export type { ProductStepKey };

interface Props {
  open: boolean;
  product: AdminProduct | null; // null = создание
  onClose: () => void;
  onSaved: () => void;
  /** Создание: новый (скрытый, DRAFT) товар — страница открывает для него оформление с ИИ. */
  onCreated?: (p: AdminProduct) => void;
  /** «Оформить с ИИ» из шлюза публикации. */
  onCompleteWithAi?: (productId: string) => void;
  /** Шаг, на котором открыться (ссылка "/products?edit=<id>&step=specs"), по умолчанию первый. */
  initialStep?: ProductStepKey;
}

/** Анимация смены шага (направление — через `custom` = dir). */
const STEP_ANIM = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -28 }),
};

function StepBody({ step, x }: { step: number; x: ProductCtx }) {
  switch (step) {
    case S.basics:
      return <BasicsStep x={x} />;
    case S.photos:
      return <PhotosStep x={x} />;
    case S.pricing:
      return <PricingStep x={x} />;
    case S.category:
      return <CategoryStep x={x} />;
    case S.specs:
      return <SpecsStep x={x} />;
    case S.site:
      return <SiteStep x={x} />;
    default:
      return <ReviewStep x={x} />;
  }
}

export function ProductModal({ open, product, onClose, onSaved, onCreated, onCompleteWithAi, initialStep }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = !product;
  const form = useProductForm(open, product, initialStep);
  const d = useProductDerived(open, product, form.f);
  const sv = useProductSave({ product, form, d, onClose, onSaved, onCreated, onCompleteWithAi });
  const { f, step, dir, go, dirty, confirmClose, setConfirmClose } = form;
  const { saving } = sv;
  const resetKey = `${open}-${product?.id ?? "new"}-${f.categoryId}`;
  const x: ProductCtx = { ...form, ...d, ...sv, product, fileRef, resetKey, onClose, onCompleteWithAi };

  /** Esc / × / «Отмена»: спросить, прежде чем выбросить полузаполненную форму. */
  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function next() {
    if (!stepValid(step, f, d.categoryIsLeaf)) {
      const message = stepError(step, f);
      if (message) toast.error(message);
      return;
    }
    go(step + 1);
  }

  const { staleAfterSave, slugChanged } = d;
  const save = sv.save;
  const isLast = step === STEPS.length - 1;
  const closeConfirm = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <span className="text-[13px] font-semibold text-[var(--text)]">Закрыть без сохранения? Изменения пропадут.</span>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setConfirmClose(false)}>
          Продолжить
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmClose(false);
            onClose();
          }}
        >
          Закрыть
        </Button>
      </div>
    </div>
  );

  if (creating) return <CreateProductModal x={x} open={open} requestClose={requestClose} closeConfirm={closeConfirm} />;

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        size="lg"
        closeOnBackdrop={false}
        fixedHeight
        title="Редактировать товар"
        footer={
          confirmClose ? (
            closeConfirm
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => (step === 0 ? requestClose() : go(step - 1))} icon={step === 0 ? undefined : <ArrowLeft className="h-4 w-4" />}>
                {step === 0 ? "Отмена" : "Назад"}
              </Button>
              <div className="flex items-center gap-2">
                {/* Save from any step — a price fix should not mean clicking through seven. */}
                {!isLast && (
                  <Button
                    variant="surface"
                    loading={saving}
                    disabled={!dirty}
                    onClick={save}
                    icon={<Check className="h-4 w-4" />}
                    title="Сохранить"
                    className="max-[374px]:w-11 max-[374px]:px-0"
                  >
                    {/* 320–360-px phones: three labelled buttons do not fit — this one becomes a ✓ icon. */}
                    <span className="max-[374px]:sr-only">Сохранить</span>
                  </Button>
                )}
                {isLast ? (
                  <Button variant="accent" loading={saving} onClick={save} icon={<Check className="h-4 w-4" />}>
                    Сохранить
                  </Button>
                ) : (
                  <Button variant="accent" onClick={next} icon={<ArrowRight className="h-4 w-4" />}>
                    Далее
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        <Stepper step={step} onJump={go} />

        {staleAfterSave > 0 && (
          <Warning>
            Правка текстов сбросит переводы uk/en ({staleAfterSave} {plural(staleAfterSave, "поле", "поля", "полей")}) — на сайте снова
            будет русский текст, пока не переведёте заново в{" "}
            <Link href="/translations" className="font-semibold text-[var(--accent-hi)] hover:underline">
              «Переводах»
            </Link>
            .
          </Warning>
        )}
        {slugChanged && (step === S.site || step === S.review) && (
          <Warning>
            Смена адреса страницы сломает старые ссылки: <span className="font-mono">/product/{product?.slug}</span> перестанет открываться
            (поиск, закладки, рассылки).
          </Warning>
        )}


        {/* -m-1 p-1: room for the 3px focus ring inside the clip used by the slide animation. */}
        <div className="relative -m-1 mt-4 overflow-hidden p-1">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={STEP_ANIM}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <StepBody step={step} x={x} />
            </motion.div>
          </AnimatePresence>
        </div>
      </Modal>
      {sv.overlays}
    </>
  );
}
