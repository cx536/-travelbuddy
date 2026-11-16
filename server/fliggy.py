"""飞猪接入：识别「订票 / 订酒店」意图 → 调用飞猪 AI 开放平台的 MCP 搜索 → 返回可跳转的预订入口。

MCP 地址：https://flyai.open.fliggy.com/mcp（Streamable HTTP，Authorization: Bearer <FLYAI_API_KEY>）
没有配置 FLYAI_API_KEY 时自动降级为飞猪官网深链，仍然可以跳转 App 完成下单。
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import date, timedelta

DEFAULT_MCP_URL = "https://flyai.open.fliggy.com/mcp"
PROTOCOL_VERSION = "2025-06-18"
TIMEOUT = 20

# 没有 MCP 结果时的兜底入口（飞猪官网对应频道，移动端会自动唤起 App）
CHANNELS = {
    "flight": {"label": "机票", "url": "https://www.fliggy.com/jipiao/", "icon": "✈️"},
    "train": {"label": "火车票", "url": "https://www.fliggy.com/huoche/", "icon": "🚄"},
    "hotel": {"label": "酒店", "url": "https://www.fliggy.com/jiudian/", "icon": "🏨"},
    "ticket": {"label": "景点门票", "url": "https://www.fliggy.com/menpiao/", "icon": "🎫"},
}

INTENT_RULES = [
    ("flight", re.compile(r"机票|航班|飞机|飞往|直飞")),
    ("train", re.compile(r"火车|高铁|动车|车票|坐车去")),
    ("hotel", re.compile(r"酒店|民宿|住宿|宾馆|住哪|开房")),
    ("ticket", re.compile(r"门票|购票|买票|预约|景区票")),
]

TOOL_KEYWORDS = {
    "flight": ("flight", "机票", "jipiao"),
    "train": ("train", "火车", "高铁"),
    "hotel": ("hotel", "酒店", "stay"),
    "ticket": ("poi", "ticket", "门票", "scenic", "attraction"),
}

URL_KEYS = ("jumpUrl", "jump_url", "bookingUrl", "booking_url", "detailUrl", "detail_url", "url", "link")
TITLE_KEYS = ("title", "name", "subject", "hotelName", "flightNo", "trainNo")
PRICE_KEYS = ("price", "priceDesc", "salePrice", "lowestPrice", "minPrice")
DESC_KEYS = ("desc", "description", "address", "summary", "subTitle", "tag")


def detect_intent(text: str) -> str | None:
    """判断用户在问哪一类票，识别不到就返回 None。"""
    for intent, pattern in INTENT_RULES:
        if pattern.search(text or ""):
            return intent
    return None


def read_key() -> str:
    return os.environ.get("FLYAI_API_KEY", "").strip()


class FliggyMCP:
    """极简 MCP 客户端：initialize → tools/list → tools/call。"""

    def __init__(self, url: str = "", key: str = "") -> None:
        self.url = url or os.environ.get("FLIGGY_MCP_URL", DEFAULT_MCP_URL)
        self.key = key
        self.session_id = ""
        self._seq = 0
        self._tools: list[dict] | None = None

    # ---------- 协议层 ----------
    def _post(self, payload: dict) -> dict:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {self.key}",
        }
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                session = response.headers.get("Mcp-Session-Id")
                if session:
                    self.session_id = session
                raw = response.read().decode("utf-8", "ignore")
                ctype = response.headers.get("Content-Type", "")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "ignore")
            try:
                detail = json.loads(detail).get("error", {}).get("message") or detail
            except (json.JSONDecodeError, AttributeError):
                pass
            raise RuntimeError(f"HTTP {error.code} {str(detail)[:80]}") from error

        if "text/event-stream" in ctype or "data:" in raw[:80]:
            for line in raw.splitlines():
                line = line.strip()
                if line.startswith("data:"):
                    chunk = line[5:].strip()
                    if chunk and chunk != "[DONE]":
                        return json.loads(chunk)
            return {}
        return json.loads(raw) if raw else {}

    def _rpc(self, method: str, params: dict | None = None) -> dict:
        self._seq += 1
        result = self._post({
            "jsonrpc": "2.0",
            "id": self._seq,
            "method": method,
            "params": params or {},
        })
        if "error" in result:
            raise RuntimeError(result["error"].get("message") or "MCP 调用失败")
        return result.get("result") or {}

    def connect(self) -> None:
        if self.session_id:
            return
        self._rpc("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "travelbuddy", "version": "1.0"},
        })
        # 协议要求初始化后发送一次通知，失败不影响后续查询
        try:
            self._post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        except Exception:  # noqa: BLE001
            pass

    def tools(self) -> list[dict]:
        if self._tools is None:
            self.connect()
            self._tools = self._rpc("tools/list").get("tools") or []
        return self._tools

    def call(self, name: str, arguments: dict) -> dict:
        self.connect()
        return self._rpc("tools/call", {"name": name, "arguments": arguments})

    # ---------- 业务层 ----------
    def pick_tool(self, intent: str) -> dict | None:
        keywords = TOOL_KEYWORDS.get(intent, ())
        for tool in self.tools():
            name = str(tool.get("name", "")).lower()
            if any(keyword in name for keyword in keywords):
                return tool
        return None

    @staticmethod
    def build_arguments(tool: dict, query: str, city: str, origin: str, day: str) -> dict:
        """按工具入参 schema 填值，未知字段统一用原始查询兜底。"""
        schema = (tool.get("inputSchema") or {}).get("properties") or {}
        required = set((tool.get("inputSchema") or {}).get("required") or [])
        args: dict = {}
        for name in schema:
            key = name.lower()
            if key in ("query", "keyword", "keywords", "q", "text", "content"):
                args[name] = query
            elif key in ("city", "destination", "dest", "to", "arrivecity", "tocity"):
                args[name] = city or query
            elif key in ("from", "origin", "departure", "fromcity"):
                args[name] = origin or city or ""
            elif key in ("date", "departuredate", "depart_date", "checkin", "startdate"):
                args[name] = day
            elif name in required:
                args[name] = query
        if not args:
            args["query"] = query
        return args


def _collect_items(node, depth: int = 0) -> list[dict]:
    """从任意结构的 MCP 返回里捞出带跳转链接的条目。"""
    items: list[dict] = []
    if depth > 6:
        return items
    if isinstance(node, list):
        for child in node:
            items.extend(_collect_items(child, depth + 1))
        return items
    if not isinstance(node, dict):
        return items

    jump = next((node[key] for key in URL_KEYS if isinstance(node.get(key), str) and node[key].startswith("http")), "")
    if jump:
        title = next((str(node[key]) for key in TITLE_KEYS if node.get(key)), "")
        price = next((node[key] for key in PRICE_KEYS if node.get(key) not in (None, "")), "")
        desc = next((str(node[key]) for key in DESC_KEYS if node.get(key) and node.get(key) != title), "")
        items.append({"title": title[:60], "price": price, "desc": desc[:80], "url": jump})
    for value in node.values():
        if isinstance(value, (dict, list)):
            items.extend(_collect_items(value, depth + 1))
    return items


def _text_of(result: dict) -> str:
    """把 tools/call 返回的 content 数组拼成文本，方便兜底解析。"""
    parts = []
    for block in result.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text", "")))
    return "\n".join(parts)


def booking_card(message: str, plan: dict | None = None) -> dict | None:
    """返回给前端的预订卡片；用户没提订票就返回 None。"""
    intent = detect_intent(message)
    if not intent:
        return None

    plan = plan or {}
    city = str(plan.get("city") or "")
    origin = str(plan.get("origin") or "")
    day = (date.today() + timedelta(days=1)).isoformat()
    channel = CHANNELS[intent]
    card = {
        "intent": intent,
        "channel": channel["label"],
        "icon": channel["icon"],
        "title": f"去飞猪订{channel['label']}",
        "query": message[:80],
        "mode": "link",
        "items": [],
        "jumpUrl": channel["url"],
    }

    key = read_key()
    if not key:
        card["note"] = "未配置 FLYAI_API_KEY，已提供飞猪官方入口，可直接跳转 App 下单"
        return card

    try:
        client = FliggyMCP(key=key)
        tool = client.pick_tool(intent)
        if not tool:
            card["note"] = "飞猪 MCP 未提供该品类的搜索工具，已提供官方入口"
            return card
        args = client.build_arguments(tool, message, city, origin, day)
        result = client.call(tool["name"], args)
        payload = result
        if not _collect_items(result):
            text = _text_of(result)
            if text:
                try:
                    payload = json.loads(text)
                except json.JSONDecodeError:
                    payload = result
        items = _collect_items(payload)
        seen = set()
        unique = []
        for item in items:
            if item["url"] in seen:
                continue
            seen.add(item["url"])
            unique.append(item)
        card["mode"] = "mcp"
        card["tool"] = tool["name"]
        card["items"] = unique[:5]
        if unique:
            card["jumpUrl"] = unique[0]["url"]
            card["note"] = f"由飞猪 MCP（{tool['name']}）实时返回"
        else:
            card["note"] = "飞猪 MCP 暂无匹配结果，已提供官方入口"
    except Exception as error:  # noqa: BLE001 网络或鉴权异常时退回官网入口
        card["note"] = f"飞猪 MCP 调用失败（{error}），已提供官方入口"
    return card
