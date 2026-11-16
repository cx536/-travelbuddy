# TravelBuddy：Flask + Chroma 向量库 + DeepSeek，部署到 Hugging Face Spaces（Docker）
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOST=0.0.0.0 \
    PORT=7860 \
    HOME=/home/appuser \
    HF_HOME=/home/appuser/.cache

RUN useradd -m -u 1000 appuser

WORKDIR /app

# 依赖单独复制，利用 Docker 层缓存
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY --chown=appuser:appuser server server
COPY --chown=appuser:appuser public public

USER appuser

# 构建期从 Hugging Face 下载 bge-small-zh 模型并预建向量库，避免容器冷启动时重算
# CI 在海外，默认走官方源；需要时可 --build-arg HF_ENDPOINT=https://hf-mirror.com
ARG HF_ENDPOINT=https://huggingface.co
ENV HF_ENDPOINT=${HF_ENDPOINT}
RUN python -c "import sys; sys.path.insert(0, 'server'); \
from rag_engine import RagEngine; \
e = RagEngine(); \
print(e.ingest() if e.collection.count() == 0 else 'already ingested'); \
print(e.stats())"

EXPOSE 7860

CMD ["python", "server/app.py"]
