# TravelBuddy：Flask + Chroma 向量库 + DeepSeek
# 目标平台：魔搭 ModelScope 创空间（Docker SDK）
# 平台要求：服务必须监听 0.0.0.0:7860，8080 被平台占用不可使用
FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOST=0.0.0.0 \
    PORT=7860 \
    HF_ENDPOINT=https://hf-mirror.com

WORKDIR /home/user/app

# 依赖单独复制，利用 Docker 层缓存
COPY server/requirements.txt server/requirements.txt
RUN pip install -r server/requirements.txt

COPY server server
COPY public public

# 构建期下载 bge-small-zh 向量模型并把 430 条城市/景点写入 Chroma，冷启动无需重算
RUN python -c "import sys; sys.path.insert(0, 'server'); \
from rag_engine import RagEngine; \
e = RagEngine(); \
print(e.ingest() if e.collection.count() == 0 else 'already ingested'); \
print(e.stats())"

EXPOSE 7860

ENTRYPOINT ["python", "-u", "server/app.py"]
