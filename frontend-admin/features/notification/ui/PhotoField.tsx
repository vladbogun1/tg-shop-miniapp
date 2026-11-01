"use client";

import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { ApiError } from "@shop/core/errors";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { broadcastApi } from "../api";
import { CAPTION_LIMIT, MAX_PHOTO_BYTES, PHOTO_TYPES, type BroadcastPhoto } from "../model/compose";

/** «Картинка» рассылки: выбрать файл, увидеть, убрать. Грузится на сервер сразу после выбора. */
export function PhotoField({
  value,
  onChange,
}: {
  value: BroadcastPhoto | null;
  onChange: (photo: BroadcastPhoto | null) => void;
}) {
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
    if (!PHOTO_TYPES.includes(file.type)) return toast.error("Подходят только JPG, PNG или WebP");
    if (file.size > MAX_PHOTO_BYTES) return toast.error("Картинка больше 5 МБ");
    setBusy(true);
    try {
      const { photoId } = await broadcastApi.uploadPhoto(file);
      onChange({ photoId, previewUrl: URL.createObjectURL(file), name: file.name });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось загрузить картинку");
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
        accept={PHOTO_TYPES.join(",")}
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a site image */}
          <img src={value.previewUrl} alt="" className="h-16 w-16 rounded-[var(--r-md)] object-cover" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-muted)]">{value.name}</span>
          <Button variant="surface" size="sm" icon={<X className="h-4 w-4" />} onClick={() => onChange(null)}>
            Убрать
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="surface" loading={busy} icon={<ImagePlus className="h-4 w-4" />} onClick={() => input.current?.click()}>
            Выбрать файл
          </Button>
        </div>
      )}
      <p className="text-[11px] text-[var(--text-faint)]">
        JPG, PNG или WebP до 5 МБ. С картинкой текст до {CAPTION_LIMIT} символов уходит подписью под ней; длиннее —
        картинкой, а следом отдельным сообщением с текстом и кнопкой.
      </p>
    </div>
  );
}
