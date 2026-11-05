"""HTTP front of the cut-out, inside the compose network only (no host port, no auth — like imgproxy).

  POST /cutout   body = the image (≤ 20 MB) → 200 image/png (RGBA, cropped to the product)
                                            → 422 text  nothing to cut (empty mask / no background)
                                            → 400 text  not an image
                                            → 503 text  waited more than MAX_WAIT s in the queue (nothing was cut)
  GET  /health   → 200 "ok" once the model is loaded

One cut at a time (a semaphore): two parallel cuts would double the ~1.3 GB peak on a shared server. The others
wait, but not longer than MAX_WAIT seconds from the moment the request arrived: after that the answer is 503 and
the backend falls back to the plain square (its own timeout is 45 s, so it never waits for a cut it will drop).
"""
from __future__ import annotations

import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import onnxruntime as ort

from cutout import NothingToCut, cut

MODEL = os.environ.get("CUTOUT_MODEL", "/models/birefnet-lite-dyn.onnx")
PORT = int(os.environ.get("CUTOUT_PORT", "8090"))
THREADS = int(os.environ.get("CUTOUT_THREADS", "2"))
MAX_BODY = 20 * 1024 * 1024
MAX_WAIT = float(os.environ.get("CUTOUT_MAX_WAIT", "40"))

log = logging.getLogger("cutout")
gate = threading.Semaphore(1)


def session() -> ort.InferenceSession:
    o = ort.SessionOptions()
    o.intra_op_num_threads = THREADS
    o.inter_op_num_threads = 1
    # no memory arena: the peak is returned to the OS after each cut instead of staying reserved
    o.enable_cpu_mem_arena = False
    return ort.InferenceSession(MODEL, o, providers=["CPUExecutionProvider"])


SESSION = session()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self._send(200, "text/plain", b"ok")
        else:
            self._send(404, "text/plain", b"not found")

    def do_POST(self):  # noqa: N802
        if self.path != "/cutout":
            self._send(404, "text/plain", b"not found")
            return
        accepted = time.monotonic()
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._send(413 if length > MAX_BODY else 400, "text/plain", b"body size")
            return
        data = self.rfile.read(length)
        if not gate.acquire(timeout=max(0.0, MAX_WAIT - (time.monotonic() - accepted))):
            log.info("queue wait over %.0fs: busy", MAX_WAIT)
            self._send(503, "text/plain", b"busy")
            return
        t = time.time()
        try:
            result = cut(SESSION, data)
        except NothingToCut as e:
            log.info("nothing to cut: %s", e)
            self._send(422, "text/plain", str(e).encode())
            return
        except Exception as e:  # noqa: BLE001 — a broken file must not take the server down
            log.info("bad image: %s", e)
            self._send(400, "text/plain", b"not an image")
            return
        finally:
            gate.release()
        log.info("cut %dx%d cover %.2f in %.1fs", result.width, result.height, result.cover, time.time() - t)
        self._send(200, "image/png", result.png)

    def _send(self, status, kind, body):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # access log off: one line per cut is logged above
        pass


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log.info("model %s loaded, port %d", MODEL, PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
