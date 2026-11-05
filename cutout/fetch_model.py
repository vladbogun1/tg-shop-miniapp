"""Build step: download the pinned model revision and refuse it unless the sha256 matches."""
import hashlib
import sys
import urllib.request

REVISION = "173d635935b93839608b9b9039da8d1d212471e9"
URL = f"https://huggingface.co/senty-au/BiRefNet_lite-ONNX-dynamic/resolve/{REVISION}/onnx/model.onnx"
SHA256 = "1e0da42f0fde010e32e938bad388457ecefe35806fde9d923421997861ae9391"

out = sys.argv[1]
h = hashlib.sha256()
with urllib.request.urlopen(URL, timeout=120) as r, open(out, "wb") as f:
    while chunk := r.read(1 << 20):
        h.update(chunk)
        f.write(chunk)
if h.hexdigest() != SHA256:
    sys.exit(f"model sha256 {h.hexdigest()} != {SHA256}")
print("model ok", out)
