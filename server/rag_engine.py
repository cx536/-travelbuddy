"""Chroma 向量库：从 public/data/pois.json 构建知识库并做相似度检索。

嵌入模型使用 fastembed（ONNX Runtime，无需 PyTorch）：BAAI/bge-small-zh-v1.5（512 维）。
"""
from __future__ import annotations

import json
import os
from pathlib import Path

# 国内直连 HuggingFace 下载模型常超时，默认走镜像（可用环境变量覆盖）
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

import chromadb  # noqa: E402
from fastembed import TextEmbedding  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent
DB_DIR = BASE_DIR / "chroma_db"
POIS_FILE = BASE_DIR.parent / "public" / "data" / "pois.json"
COLLECTION = "travel_kb"
EMBED_MODEL = "BAAI/bge-small-zh-v1.5"
# 国内网络访问不了 HuggingFace，模型文件从 ModelScope 预先下载到这里
MODEL_DIR = BASE_DIR / "models" / "bge-small-zh-v1.5"

CATEGORY_LABELS = {
    "art": "艺术展馆", "family": "亲子娱乐", "food": "美食餐饮", "history": "历史人文",
    "landmark": "城市地标", "nature": "自然风光", "night": "夜游娱乐", "shopping": "休闲购物",
}


def build_docs() -> list[dict]:
    """把城市与景点拼成可检索的文档，字段与前端 assistant 需要的保持一致。"""
    data = json.loads(POIS_FILE.read_text(encoding="utf-8"))
    docs: list[dict] = []
    for city in data["cities"]:
        city_text = " ".join([
            city["name"], city["blurb"], f"最佳季节 {city['best_season']}",
            f"住宿区域 {city['hotel_area']}", " ".join(city["tips"]),
        ])
        docs.append({
            "id": f"city-{city['id']}",
            "text": city_text,
            "meta": {"type": "city", "city": city["name"], "name": city["name"]},
        })
        for poi in city["pois"]:
            label = CATEGORY_LABELS.get(poi["category"], "城市看点")
            meta = {
                "type": "poi", "city": city["name"], "name": poi["name"],
                "category": label, "ticket": poi["ticket"],
                "duration": poi["duration"], "rating": poi["rating"], "desc": poi["desc"],
            }
            # pois.json 里填了 image 就用自己上传的照片
            if poi.get("image"):
                meta["image"] = poi["image"]
            docs.append({
                "id": poi["id"],
                "text": " ".join([
                    city["name"], poi["name"], label, poi["desc"],
                    f"门票 {poi['ticket']} 元", f"建议游玩 {poi['duration']} 分钟", f"评分 {poi['rating']}",
                ]),
                "meta": meta,
            })
    return docs


class RagEngine:
    def __init__(self) -> None:
        self.client = chromadb.PersistentClient(path=str(DB_DIR))
        # 本地有模型文件就直接加载，否则退回 fastembed 默认的在线下载
        local_model = str(MODEL_DIR) if (MODEL_DIR / "model_optimized.onnx").exists() else None
        self.embedding = TextEmbedding(model_name=EMBED_MODEL, specific_model_path=local_model)
        # 自己算向量再写入，避免 Chroma 持久化嵌入函数配置的兼容问题
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )

    @property
    def dims(self) -> int:
        return len(self.embedding.embed(["维度探测"]).__next__())

    def _embed(self, texts: list[str]) -> list[list[float]]:
        return [vector.tolist() for vector in self.embedding.embed(texts)]

    def reset(self) -> None:
        try:
            self.client.delete_collection(COLLECTION)
        except Exception:  # noqa: BLE001 集合不存在时忽略
            pass
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )

    def ingest(self, force: bool = False) -> dict:
        """整体重建知识库：数据源只有 78 条，直接清空重写最简单可靠。"""
        docs = build_docs()
        if force:
            self.reset()
        self.collection.upsert(
            ids=[doc["id"] for doc in docs],
            documents=[doc["text"] for doc in docs],
            metadatas=[doc["meta"] for doc in docs],
            embeddings=self._embed([doc["text"] for doc in docs]),
        )
        return {"docs": len(docs), "total": self.collection.count()}

    def search(self, question: str, top_k: int = 6) -> list[dict]:
        total = self.collection.count()
        if not total:
            return []
        result = self.collection.query(
            query_embeddings=self._embed([question]),
            n_results=min(top_k, total),
            include=["documents", "metadatas", "distances"],
        )
        hits: list[dict] = []
        for index, text in enumerate(result["documents"][0]):
            meta = result["metadatas"][0][index] or {}
            distance = result["distances"][0][index] if result.get("distances") else 0.0
            hits.append({"text": text, "meta": meta, "score": round(1 - distance, 4)})
        return hits

    def stats(self) -> dict:
        return {
            "collection": COLLECTION,
            "embedding": EMBED_MODEL,
            "documents": self.collection.count(),
            "dims": self.dims,
            "db_path": str(DB_DIR),
        }
