/** Картинки для e2e загрузки файлов. */
import { crc32, deflateSync } from "node:zlib";

/** Серый PNG 240×320: настоящий файл, чтобы сервер узнал его по содержимому, а не по имени. */
export function screenshotPng(): Buffer {
  const w = 240;
  const h = 320;
  const raw = Buffer.alloc((w + 1) * h, 0xe0);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth, colour type 0 = grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
