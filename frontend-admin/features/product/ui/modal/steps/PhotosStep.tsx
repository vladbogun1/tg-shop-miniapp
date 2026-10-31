"use client";

import { PhotoUploader } from "../PhotoUploader";
import type { ProductCtx } from "../ctx";

export function PhotosStep({ x }: { x: ProductCtx }) {
  const { f, set, fileRef, uploading, uploadFiles, moveImage } = x;
  return (
    <PhotoUploader
      fileRef={fileRef}
      imageKeys={f.imageKeys}
      uploading={uploading}
      onFiles={uploadFiles}
      onRemove={(i) => set("imageKeys", f.imageKeys.filter((_, j) => j !== i))}
      onReorder={moveImage}
    />
  );
}
