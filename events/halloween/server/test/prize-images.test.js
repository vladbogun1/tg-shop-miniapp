import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HW_DATA_DIR = mkdtempSync(join(tmpdir(), "hw-prize-img-"));
const { cleanImages } = await import("../src/prizes.js");

test("a pack picture shipped with the service is kept next to shop photos and https links", () => {
  assert.deepEqual(
    cleanImages(["sets/wave-white", "products/a/b.webp", "https://x.test/p.jpg"]),
    ["sets/wave-white", "products/a/b.webp", "https://x.test/p.jpg"],
  );
});

test("anything that could leave the assets folder or the bucket is dropped", () => {
  assert.deepEqual(cleanImages(["sets/../server", "sets/Wave", "http://x.test/p.jpg", "/etc/passwd"]), []);
});
