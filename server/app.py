"""TravelBuddy 本地服务：Flask 同源托管前端 + Chroma 向量检索 + DeepSeek 生成。

启动：
    python server/app.py
访问 http://127.0.0.1:5007

DeepSeek key 读取顺序：环境变量 DEEPSEEK_API_KEY > server/.env。
"""
from __future__ import annotations

import json
import os
import re
import hashlib
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import quote

from flask import Flask, Response, jsonify, request, send_file, send_from_directory

from fliggy import booking_card
from rag_engine import RagEngine

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR.parent / "public"
ENV_FILE = BASE_DIR / ".env"
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
IMAGE_API = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image"
IMAGE_CACHE = PUBLIC_DIR / "img" / "gen"

PREFERENCE_HINT = "自然、人文、美食、亲子、艺术、夜景、购物"

SYSTEM_PROMPT = f"""你是「TravelBuddy」的行程顾问，面向真实出行用户。
规则：
1. 只能依据【知识库片段】中的景点、城市信息作答，不要编造不存在的景点或票价。
2. 回复用简体中文，150 字以内，口语化，可给出 2-3 条可执行建议。
3. 必须输出 JSON 对象，不要加代码块，字段如下：
{{"reply":"给用户的回复","city":"城市名或null","days":3,"travelers":2,
 "preferences":["美食"],"pace":"relaxed|normal|packed","budget_level":"economy|comfort|luxury",
 "suggestions":["一句追问建议","另一句"]}}
4. city 只在用户明确想去某座城市时填写，可选城市：北京、上海、成都、西安、杭州、厦门；无法判断时填 null。
5. preferences 只能从这些里选：{PREFERENCE_HINT}。
6. days 取 1-7 的整数，travelers 取 1-10 的整数，缺省用 3 和 2。
7. 用户要订机票、火车票、酒店或门票时，在 reply 里提醒可直接点下方的飞猪入口下单，不要编造票价与余票。
8. reply 必须点名【知识库片段】里的景点或城市名称（至少 2 个），让用户看出内容来自知识库。"""


def load_env() -> None:
    """把 server/.env 里的键写入环境变量（已存在的环境变量优先）。"""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


load_env()

app = Flask(__name__, static_folder=None)


@app.after_request
def allow_cross_origin(response):
    """小程序 H5 预览、App 端跨域调用 /api/* 时放行。"""
    if request.path.startswith("/api/"):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response

app.json.ensure_ascii = False

# 只读的向量库浏览页：http://127.0.0.1:5007/kb
KB_HTML = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TravelBuddy · 知识库</title>
<style>
  :root { --brand:#0f766e; --line:#e3e8ef; --muted:#64748b; --bg:#f5f7fa; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:#0f172a;
         font:14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 20px 60px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 18px; }
  .bar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px; }
  input, select, button { font: inherit; border-radius:10px; border:1px solid var(--line); padding:9px 12px; }
  input { flex:1 1 320px; background:#fff; }
  button { background:var(--brand); color:#fff; border-color:var(--brand); cursor:pointer; }
  button.ghost { background:#fff; color:#0f172a; border-color:var(--line); }
  .meta { color:var(--muted); font-size:13px; margin-bottom:12px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin-bottom:10px;
          display:flex; gap:14px; align-items:flex-start; }
  .thumb { width:84px; height:84px; flex:0 0 84px; border-radius:10px; object-fit:cover; background:#eef2f7; }
  .card__body { min-width:0; flex:1; }
  .card h3 { margin:0 0 6px; font-size:15px; }
  .tags { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
  .tag { font-size:12px; color:var(--muted); background:#f1f5f9; border-radius:999px; padding:1px 8px; }
  .tag.score { color:#b45309; background:#fef3c7; }
  .doc { color:#334155; }
  code { color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>知识库 · Chroma 向量库（只读）</h1>
  <div class="sub" id="subtitle">加载中…</div>
  <div class="bar">
    <input id="q" placeholder="输入关键词做语义检索，例如：成都带娃 / 哈尔滨 冬天 / 门票免费">
    <select id="limit">
      <option value="20" selected>20 条</option>
      <option value="50">50 条</option>
      <option value="200">200 条</option>
      <option value="500">全部</option>
    </select>
    <button id="search">语义检索</button>
    <button class="ghost" id="all">按入库顺序</button>
  </div>
  <div class="meta" id="meta"></div>
  <div id="list"></div>
</div>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

async function load(q) {
  const limit = $("#limit").value;
  $("#meta").textContent = "查询中…";
  const url = "/api/docs?limit=" + limit + (q ? "&q=" + encodeURIComponent(q) : "");
  const res = await fetch(url);
  const data = await res.json();
  $("#subtitle").textContent = "集合 travel_kb · 共 " + data.total + " 条文档（城市 + 景点，文本与向量同库）";
  $("#meta").textContent = (q ? "语义检索「" + q + "」" : "按入库顺序") + " · 返回 " + data.count + " 条";
  $("#list").innerHTML = data.items.map((it) => {
    const tags = [
      it.type === "city" ? "城市" : "景点",
      it.city, it.category, it.ticket != null ? "门票 " + it.ticket + " 元" : "",
      it.rating ? "评分 " + it.rating : "", it.duration ? it.duration + " 分钟" : "",
      it.score != null ? "相似度 " + it.score : "",
    ].filter(Boolean);
    const thumb = it.thumb
      ? `<img class="thumb" loading="lazy" alt="" src="${esc(it.thumb)}" onerror="this.onerror=null;this.src='/img/placeholder.svg'">`
      : "";
    return `<div class="card">${thumb}<div class="card__body">
      <h3>${esc(it.name || it.id)}</h3>
      <div class="tags">${tags.map((t, i) =>
        `<span class="tag${i === tags.length - 1 && it.score != null ? " score" : ""}">${esc(t)}</span>`).join("")}</div>
      <div class="doc">${esc(it.doc)}</div>
      ${it.id ? `<code>${esc(it.id)}</code>` : ""}
    </div></div>`;
  }).join("") || '<div class="card">没有结果</div>';
}

$("#search").onclick = () => { const q = $("#q").value.trim(); load(q); };
$("#all").onclick = () => { $("#q").value = ""; load(""); };
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#search").click(); });
load("");
</script>
</body>
</html>
"""


engine: RagEngine | None = None


def get_engine() -> RagEngine:
    global engine
    if engine is None:
        engine = RagEngine()
    return engine


def read_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if key:
        return key
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def build_context(hits: list[dict]) -> str:
    lines = []
    for index, hit in enumerate(hits):
        meta = hit["meta"]
        label = "（城市概况）" if meta.get("type") == "city" else f"（{meta.get('category', '景点')}）"
        lines.append(
            f"{index + 1}. [{meta.get('city')}] {meta.get('name')}{label}：{hit['text']}（相似度 {hit['score']:.2f}）"
        )
    return "\n".join(lines)


def build_cards(hits: list[dict], limit: int = 2) -> list[dict]:
    """把命中的景点做成图文卡片：文字全部取自知识库，图片按景点名抓真实照片。"""
    cards: list[dict] = []
    for hit in hits:
        meta = hit["meta"]
        if meta.get("type") != "poi":
            continue
        keyword = f"{meta.get('city', '')} {meta.get('name', '')}".strip()
        cards.append({
            "name": meta.get("name"),
            "city": meta.get("city"),
            "category": meta.get("category"),
            "desc": meta.get("desc") or "",
            "ticket": meta.get("ticket"),
            "rating": meta.get("rating"),
            "score": hit["score"],
            "image": meta.get("image") or f"/api/image?q={quote(keyword)}&v=2",
        })
        if len(cards) >= limit:
            break
    return cards


def parse_model_json(content: str) -> dict | None:
    text = str(content or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
    if text.endswith("```"):
        text = text[: text.rfind("```")]
    text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


def chat_with_deepseek(message: str, hits: list[dict], plan: dict) -> dict:
    """调用 DeepSeek，返回与前端约定一致的字段；异常时降级为 fallback。"""
    key = read_key()
    sources = [
        {"name": hit["meta"].get("name"), "city": hit["meta"].get("city"), "score": hit["score"]}
        for hit in hits
    ]
    if not key:
        return {
            "ok": True, "source": "mock", "fallback": True, "reply": "", "sources": sources,
            "message": "未配置 DEEPSEEK_API_KEY，已使用本地规则引擎",
        }

    current = ""
    if plan and plan.get("city"):
        current = (
            f"当前行程：{plan['city']} {plan.get('days') or 3} 天，"
            f"{plan.get('travelers') or 2} 人，出发地 {plan.get('origin') or '未填'}。"
        )
    user_content = "\n".join([
        current,
        f"用户说：{message}",
        "【知识库片段】",
        build_context(hits) or "（没有命中相关景点，请引导用户换一座城市或换个说法）",
    ]).strip()

    payload = {
        "model": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        "temperature": 0.7,
        "max_tokens": 900,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    }
    req = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "ignore")[:160]
        return {
            "ok": True, "source": "mock", "fallback": True, "reply": "", "sources": sources,
            "message": f"DeepSeek 返回 {error.code}：{detail}",
        }
    except Exception as error:  # noqa: BLE001
        return {
            "ok": True, "source": "mock", "fallback": True, "reply": "", "sources": sources,
            "message": f"DeepSeek 调用失败：{error}",
        }

    content = result["choices"][0]["message"]["content"]
    parsed = parse_model_json(content)
    if not parsed or not parsed.get("reply"):
        return {"ok": True, "source": "mock", "fallback": True, "reply": "", "sources": sources,
                "message": "模型返回格式异常"}

    return {
        "ok": True,
        "source": "ai",
        "reply": str(parsed["reply"])[:800],
        "params": {
            "city": parsed.get("city") or None,
            "days": parsed.get("days"),
            "travelers": parsed.get("travelers"),
            "preferences": parsed.get("preferences") if isinstance(parsed.get("preferences"), list) else [],
            "pace": parsed.get("pace") or "normal",
            "budget_level": parsed.get("budget_level") or "comfort",
        },
        "suggestions": (parsed.get("suggestions") or [])[:3] if isinstance(parsed.get("suggestions"), list) else [],
        "sources": sources,
        "usage": result.get("usage"),
    }


@app.get("/api/ai/status")
def ai_status():
    stats = get_engine().stats()
    return jsonify({
        "ok": True,
        "mode": "ai" if read_key() else "mock",
        "model": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        "index_docs": stats["documents"],
        "dims": stats["dims"],
        "vector_store": "chroma",
    })


IMAGE_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def image_suffix(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:4] == b"\x89PNG":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ""


def fetch_real_photo(query: str) -> bytes:
    """用必应图片搜索抓一张真实景点照片，任何环节失败都返回空字节。"""
    search = (
        "https://cn.bing.com/images/search?q="
        f"{quote(query)}&mkt=zh-CN&setlang=zh-Hans&first=1"
    )
    req = urllib.request.Request(search, headers={"User-Agent": IMAGE_UA})
    with urllib.request.urlopen(req, timeout=20) as response:
        html = response.read().decode("utf-8", "ignore")
    urls = re.findall(r"murl&quot;:&quot;(https?://[^&]+?)&quot;", html)
    # 优先避开带水印的图库站，没有其他选择时再退回
    clean = [u for u in urls if not re.search(r"699pic|vcg\.com|gettyimages|shutterstock|dpmodel", u, re.I)]
    for url in (clean or urls)[:10]:
        if not re.search(r"\.(jpe?g|png|webp)", url, re.I):
            continue
        parts = urllib.parse.urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}/"
        try:
            image_req = urllib.request.Request(
                url, headers={"User-Agent": IMAGE_UA, "Referer": origin}
            )
            with urllib.request.urlopen(image_req, timeout=20) as response:
                data = response.read()
            if len(data) > 20000 and image_suffix(data):
                return data
        except Exception:  # noqa: BLE001 换下一张
            continue
    return b""


@app.get("/api/image")
def poi_image():
    """配图接口：优先抓真实景点照片，失败时退回生成图，最后退回站内占位图。"""
    query = (request.args.get("q") or request.args.get("prompt") or "").strip()[:120]
    fallback = PUBLIC_DIR / "img" / "placeholder.svg"
    if not query:
        return send_file(fallback, mimetype="image/svg+xml")

    IMAGE_CACHE.mkdir(parents=True, exist_ok=True)
    digest = hashlib.md5(query.encode("utf-8")).hexdigest()
    cached = next(iter(IMAGE_CACHE.glob(f"{digest}.*")), None)
    if cached is None:
        data = b""
        try:
            data = fetch_real_photo(query)
        except Exception:  # noqa: BLE001 搜索失败就走生成图
            data = b""
        if not data:
            try:
                with urllib.request.urlopen(
                    f"{IMAGE_API}?prompt={quote(query)}&image_size=landscape_4_3", timeout=60
                ) as response:
                    data = response.read()
            except Exception:  # noqa: BLE001
                data = b""
        suffix = image_suffix(data)
        if suffix and len(data) > 10000:
            cached = IMAGE_CACHE / f"{digest}{suffix}"
            cached.write_bytes(data)
    if cached is not None and cached.exists():
        return send_from_directory(IMAGE_CACHE, cached.name, max_age=604800)
    return send_file(fallback, mimetype="image/svg+xml")


@app.post("/api/agent/chat")
def agent_chat():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message") or "").strip()
    if not message:
        return jsonify({"ok": False, "message": "请先说一句话"}), 400
    hits = get_engine().search(message, 6)
    data = chat_with_deepseek(message, hits, payload.get("plan") or {})
    data["cards"] = build_cards(hits)
    booking = booking_card(message, payload.get("plan") or {})
    if booking:
        data["booking"] = booking
    return jsonify(data)


def doc_thumb(item: dict) -> str:
    """文档缩略图：优先用 pois.json 里填的本地图，否则走 /api/image 抓取并缓存。"""
    if item.get("image"):
        return str(item["image"])
    keyword = (item.get("city") or "") if item.get("type") == "city" else f"{item.get('city') or ''} {item.get('name') or ''}"
    keyword = keyword.strip()
    return f"/api/image?q={quote(keyword)}&v=2" if keyword else ""


@app.get("/api/docs")
def docs_api():
    """只读接口：不带 q 时按顺序列出文档，带 q 时做向量检索。"""
    query = (request.args.get("q") or "").strip()
    try:
        limit = int(request.args.get("limit") or 50)
    except ValueError:
        limit = 50
    limit = max(1, min(limit, 500))
    eng = get_engine()
    total = eng.collection.count()
    if query:
        items = [
            {"id": "", "doc": hit["text"], "score": hit["score"], **hit["meta"]}
            for hit in eng.search(query, limit)
        ]
    else:
        result = eng.collection.get(limit=limit, include=["documents", "metadatas"])
        items = [
            {"id": doc_id, "doc": text, **(meta or {})}
            for doc_id, text, meta in zip(
                result["ids"], result["documents"], result["metadatas"]
            )
        ]
    for item in items:
        item["thumb"] = doc_thumb(item)
    return jsonify({"ok": True, "total": total, "count": len(items), "items": items})


@app.get("/kb")
def kb_page():
    return Response(KB_HTML, mimetype="text/html; charset=utf-8")


@app.post("/api/ingest")
def ingest():
    force = request.args.get("force") == "1"
    return jsonify(get_engine().ingest(force=force))


@app.get("/")
def index():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/sw.js")
def service_worker():
    """Service Worker 必须不被缓存，否则更新无法生效。"""
    response = send_from_directory(PUBLIC_DIR, "sw.js", mimetype="text/javascript")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Service-Worker-Allowed"] = "/"
    return response


@app.get("/manifest.json")
def web_manifest():
    return send_from_directory(PUBLIC_DIR, "manifest.json", mimetype="application/manifest+json")


@app.get("/<path:filename>")
def static_files(filename: str):
    return send_from_directory(PUBLIC_DIR, filename)


def main() -> None:
    global engine
    engine = RagEngine()
    if engine.collection.count() == 0:
        print("向量库为空，正在从 public/data/pois.json 入库 …")
        print(engine.ingest())
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5007"))
    print(f"Chroma 就绪：{engine.stats()}")
    print(f"TravelBuddy: http://{host}:{port}")
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
