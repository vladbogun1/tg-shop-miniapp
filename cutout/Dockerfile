# Product cut-out for «фото по ссылке» (see cutout.py). Internal service: the backend calls it, nothing else.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir --root-user-action=ignore \
      onnxruntime==1.31.1 numpy==2.5.4 pillow==13.0.0

WORKDIR /app
COPY fetch_model.py .
RUN mkdir /models && python fetch_model.py /models/birefnet-lite-dyn.onnx && rm fetch_model.py

COPY cutout.py server.py ./
RUN useradd --system --no-create-home cutout
USER cutout

EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=4).status == 200 else 1)"
CMD ["python", "server.py"]
