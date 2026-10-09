"use client";

/**
 * Brand logo for the site's brand marquee (home page, under the hero): upload (click or drop an
 * SVG/PNG/WebP), a preview on the site's own dark background in both modes — exactly how the logo
 * sits in the strip at rest and on hover — the mode switch and «Удалить». Without a logo the strip
 * shows the brand name in the display font, which is what the empty preview shows too.
 *
 * The value is the S3 key from POST /api/admin/brands/uploads (or an https URL); it is saved with
 * the rest of the brand form.
 */
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { brandLogoSrc } from "@shop/shared";
import { adminApi, ApiError, type BrandLogoMode } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8082/img";

const ACCEPT = ".svg,.png,.webp,image/svg+xml,image/png,image/webp";
const TYPES = ["image/svg+xml", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

/** The site's page background (site/app/globals.css --bg). */
const SITE_BG = "#0E0E10";

export const LOGO_MODES: { value: BrandLogoMode; label: string }[] = [
  { value: "MONO", label: "Одним цветом" },
  { value: "ORIGINAL", label: "Оригинальные цвета" },
];

/** Source for an <img>: a local blob preview as-is, otherwise imgproxy / the absolute URL. */
export function logoSrc(value: string): string {
  return brandLogoSrc(value, IMAGE_BASE);
}

/** Small logo chip for the brands table: the logo in its mode on the site background. */
export function BrandLogoThumb({ url, mode, name }: { url: string | null; mode: BrandLogoMode; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span
        className="font-display grid h-7 w-[72px] place-items-center overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)] px-1 text-[9.5px] font-bold uppercase tracking-[.08em] text-[var(--text-faint)]"
        style={{ background: SITE_BG }}
        title={failed ? "Логотип не загрузился" : "Нет логотипа — на сайте будет название"}
      >
        <span className="truncate">{failed ? "ошибка" : "—"}</span>
      </span>
    );
  }
  return (
    <span
      className="grid h-7 w-[72px] place-items-center rounded-[var(--r-sm)] border border-[var(--line)] px-1.5"
      style={{ background: SITE_BG }}
      title={`Логотип «${name}» · ${mode === "MONO" ? "одним цветом" : "оригинальные цвета"}`}
    >
      <img
        src={logoSrc(url)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="max-h-[18px] max-w-full object-contain"
        style={mode === "MONO" ? { filter: "brightness(0) invert(1)", opacity: 0.8 } : undefined}
      />
    </span>
  );
}

export function BrandLogoField({
  name,
  value,
  mode,
  onChange,
  onModeChange,
  upload = adminApi.uploadBrandLogo,
}: {
  name: string;
  /** S3 key / URL; "" = no logo. */
  value: string;
  mode: BrandLogoMode;
  onChange: (v: string) => void;
  onModeChange: (m: BrandLogoMode) => void;
  /** Injectable for the dev sandbox. */
  upload?: (file: File) => Promise<{ key: string }>;
}) {
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  // A just-picked file shows from memory at once (and stays so, imgproxy may lag a second).
  const [local, setLocal] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => {
    if (local) URL.revokeObjectURL(local.url);
  }, [local]);
  useEffect(() => setFailed(false), [value]);

  const shown = value ? (local && local.key === value ? local.url : logoSrc(value)) : null;

  async function take(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!TYPES.includes(file.type) && !["svg", "png", "webp"].includes(ext)) {
      push("Нужен SVG, PNG или WebP", "error");
      return;
    }
    if (file.size > MAX_BYTES) {
      push("Логотип больше 2 МБ — сожмите или возьмите SVG", "error");
      return;
    }
    setUploading(true);
    try {
      const { key } = await upload(file);
      setLocal({ key, url: URL.createObjectURL(file) });
      onChange(key);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось загрузить логотип", "error");
    } finally {
      setUploading(false);
    }
  }

  const pick = () => fileRef.current?.click();

  return (
    <div
      className="flex flex-col gap-2"
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files);
      }}
    >
      <span className="field-label">Логотип для бегущей строки</span>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files);
          e.target.value = "";
        }}
      />

      {!value ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Загрузить логотип"
          onClick={pick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick();
            }
          }}
          className={cn(
            "focusable flex cursor-pointer items-center gap-4 rounded-[var(--r-lg)] border border-dashed p-3 transition-colors",
            over ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line-strong)] hover:border-[var(--accent)]"
          )}
        >
          <span
            className="font-display grid h-14 w-40 shrink-0 place-items-center overflow-hidden rounded-[var(--r-md)] px-3 text-[15px] font-bold uppercase tracking-[.1em] text-white/55"
            style={{ background: SITE_BG }}
            aria-hidden
          >
            <span className="truncate">{name.trim() || "Бренд"}</span>
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-display inline-flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[.06em] text-[var(--text)]">
              {uploading ? <Spinner className="h-4 w-4" /> : <UploadCloud className="h-4 w-4 text-[var(--accent-hi)]" />}
              {uploading ? "Загрузка…" : "Перетащите или нажмите"}
            </span>
            <span className="text-[12px] leading-snug text-[var(--text-faint)]">
              SVG, PNG или WebP до 2 МБ. Без логотипа в строке будет название шрифтом — как слева.
            </span>
          </span>
        </div>
      ) : (
        <div className={cn("flex flex-col gap-3 rounded-[var(--r-lg)] border p-3", over ? "border-[var(--accent)]" : "border-[var(--line)]")}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Как показывать логотип">
            {LOGO_MODES.map((m) => {
              const active = m.value === mode;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onModeChange(m.value)}
                  className={cn(
                    "focusable group relative flex flex-col items-stretch gap-1.5 rounded-[var(--r-md)] border p-1.5 text-left transition-colors",
                    active ? "border-[var(--accent)] shadow-[var(--ring-accent)]" : "border-[var(--line)] hover:border-[var(--line-strong)]"
                  )}
                >
                  <span className="relative grid h-16 place-items-center overflow-hidden rounded-[var(--r-sm)] px-4" style={{ background: SITE_BG }}>
                    {uploading ? (
                      <Spinner className="h-4 w-4" />
                    ) : failed || !shown ? (
                      <span className="text-[11.5px] text-[var(--danger-ink)]">не загрузился</span>
                    ) : (
                      <img
                        src={shown}
                        alt={active ? `Логотип ${name}` : ""}
                        onError={() => setFailed(true)}
                        className={cn(
                          "max-h-7 max-w-full object-contain transition-[filter,opacity] duration-300",
                          m.value === "MONO"
                            ? "opacity-55 [filter:brightness(0)_invert(1)] group-hover:opacity-100"
                            : "opacity-80 group-hover:opacity-100"
                        )}
                      />
                    )}
                  </span>
                  <span className={cn("px-1 text-[12px] font-semibold", active ? "text-[var(--accent-hi)]" : "text-[var(--text-muted)]")}>
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
          <SegmentedControl<BrandLogoMode> size="sm" value={mode} onChange={onModeChange} options={LOGO_MODES} className="self-start" />
          <p className="text-[12px] leading-snug text-[var(--text-faint)]">
            {mode === "MONO"
              ? "Логотип перекрашивается в белый под тёмную тему и светится при наведении. Нужен прозрачный фон: SVG или PNG — иначе выйдет белый прямоугольник."
              : "Логотип показывается как есть — для цветных знаков, которые узнают по цвету. На тёмном фоне должен читаться."}{" "}
            Наведите на превью — так он выглядит при наведении на сайте.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="surface" icon={<ImagePlus className="h-4 w-4" />} onClick={pick} loading={uploading}>
              Заменить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                setLocal(null);
                onChange("");
              }}
              disabled={uploading}
            >
              Удалить логотип
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
