"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { extApi } from "@/lib/api-extra";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/toast";

/** A picture already uploaded to the backend: `photoId` goes into the test / broadcast request. */
export interface BroadcastPhoto {
  photoId: string;
  /** Object URL of the local file, for the preview. */
  previewUrl: string;
  name: string;
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** Telegram's limit for a photo caption; longer text goes as a separate message. */
export const CAPTION_LIMIT = 1024;

/** «Картинка» of a broadcast: pick a file, see it, remove it. Uploads right after the choice. */
export function PhotoField({
  value,
  onChange,
}: {
  value: BroadcastPhoto | null;
  onChange: (photo: BroadcastPhoto | null) => void;
}) {
  const { push } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = value?.previewUrl;

  // Release the object URL when the picture is replaced or removed.
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return push("Подходят только JPG, PNG или WebP", "error");
    if (file.size > MAX_PHOTO_BYTES) return push("Картинка больше 5 МБ", "error");
    setBusy(true);
    try {
      const { photoId } = await extApi.broadcastPhoto(file);
      onChange({ photoId, previewUrl: URL.createObjectURL(file), name: file.name });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось загрузить картинку", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">Картинка (необязательно)</span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value.previewUrl} alt="" className="h-16 w-16 rounded-[var(--r-md)] object-cover" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-muted)]">{value.name}</span>
          <Button variant="surface" size="sm" icon={<X className="h-4 w-4" />} onClick={() => onChange(null)}>
            Убрать
          </Button>
        </div>
      ) : (
        <div>
          <Button
            variant="surface"
            loading={busy}
            icon={<ImagePlus className="h-4 w-4" />}
            onClick={() => input.current?.click()}
          >
            Выбрать файл
          </Button>
        </div>
      )}
      <p className="text-[11px] text-[var(--text-faint)]">
        JPG, PNG или WebP до 5 МБ. С картинкой текст до {CAPTION_LIMIT} символов уходит подписью под ней;
        длиннее — картинкой, а следом отдельным сообщением с текстом и кнопкой.
      </p>
    </div>
  );
}
