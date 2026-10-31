"use client";

import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { H1_MAX, INTRO_MAX, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, wordCount, type Form } from "../../model/category-form";
import { Note } from "./parts";

/** «SEO»: заголовок, описание, H1 и текст страницы категории (русский источник). */
export function CategorySeoTab({
  f,
  set,
  seoSourceChanged,
}: {
  f: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  seoSourceChanged: boolean;
}) {
  const introWords = wordCount(f.introText);
  return (
  <div className="flex flex-col gap-4">
    <p className="text-[12.5px] leading-relaxed text-[var(--text-faint)]">
      Текст на русском. Пустое поле — сайт берёт свой шаблон. Украинская и английская страницы используют поле, только
      когда у него есть перевод (иначе — шаблон). Переводы — во вкладке{" "}
      <Link href="/translations" className="font-semibold text-[var(--accent)] hover:underline">
        «Переводы»
      </Link>
      , фильтр «Категории».
    </p>
    <Input
      label="SEO-заголовок (title)"
      value={f.seoTitle}
      maxLength={SEO_TITLE_MAX}
      onChange={(e) => set("seoTitle", e.target.value)}
      placeholder={`${f.name || "Категория"} — купить в Украине`}
      hint={`${f.seoTitle.length}/${SEO_TITLE_MAX} · вкладка браузера и выдача поиска (видно ~60 символов). Пусто — шаблон.`}
    />
    <Textarea
      label="SEO-описание (description)"
      rows={3}
      maxLength={SEO_DESCRIPTION_MAX}
      value={f.seoDescription}
      onChange={(e) => set("seoDescription", e.target.value)}
      placeholder="Пусто — шаблон: число товаров, цена «от», доставка"
      hint={`${f.seoDescription.length}/${SEO_DESCRIPTION_MAX} · сниппет в поиске (видно ~160 символов)`}
    />
    <Input
      label="Заголовок H1 (необязательно)"
      value={f.h1}
      maxLength={H1_MAX}
      onChange={(e) => set("h1", e.target.value)}
      placeholder={f.name || "по умолчанию — название"}
      hint="Крупный заголовок на странице категории. Пусто — название."
    />
    <Textarea
      label="SEO-текст категории"
      rows={8}
      maxLength={INTRO_MAX}
      value={f.introText}
      onChange={(e) => set("introText", e.target.value)}
      placeholder="300–600 слов о категории: что это, как выбрать, чем отличаются товары. Абзацы — через пустую строку."
      hint={`${introWords} слов${introWords > 0 && (introWords < 300 || introWords > 600) ? " · рекомендуем 300–600" : ""}`}
    />
    {seoSourceChanged && (
      <Note>
        После сохранения переводы изменённых SEO-полей устареют: пока их не обновят во вкладке «Переводы», украинская и
        английская страницы будут на шаблоне сайта.
      </Note>
    )}
    </div>
  );
}
