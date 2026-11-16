---
title: TravelBuddy
emoji: 🧭
colorFrom: teal
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# TravelBuddy 智能旅游路线规划

Flask + Chroma 向量库 + DeepSeek 的行程助手，支持 33 座城市 / 397 个景点检索、逐日行程规划、飞猪订票跳转，并可作为 PWA 安装到手机主屏。

## 部署到 Render（推荐，国内可直接访问）

1. 把本目录推到 GitHub 仓库（只需 `Dockerfile`、`render.yaml`、`server/`、`public/`、`README.md`）。
2. Render 控制台 → **New → Blueprint** → 选择该仓库，会自动读取 `render.yaml` 创建 Web Service。
3. 在环境变量里填 `DEEPSEEK_API_KEY`（`sync: false` 表示由你在控制台手动填，不写进仓库）。
4. 构建 5-10 分钟后访问 `https://<服务名>.onrender.com`，健康检查路径 `/api/ai/status`。

免费实例闲置 15 分钟会休眠，下次访问冷启动约 40 秒；向量库已打进镜像，不会重建。

## 部署到 Hugging Face Spaces

1. 打开 https://huggingface.co/new-space ，Space name 填 `travelbuddy`，SDK 选 **Docker**，模板选 **Blank**，可见性选 **Public**，创建。
2. 在 Space 的 **Settings → Variables and secrets** 添加：
   - Secret：`DEEPSEEK_API_KEY` = 你的 DeepSeek Key
   - 可选 Variable：`DEEPSEEK_MODEL` = `deepseek-chat`
3. 用网页上传或 git 推送本目录（`Dockerfile`、`server/`、`public/`、`README.md`）到 Space 仓库。
4. 等待构建完成，访问 `https://<用户名>-travelbuddy.hf.space`。

> 向量库在镜像构建阶段自动建立（430 条文档），无需手动 `ingest`；模型使用镜像源下载，构建约 3-6 分钟。

## 环境变量

| 名称 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | 必填，Secret 形式保存 |
| `DEEPSEEK_MODEL` | 可选，默认 `deepseek-chat` |
| `PORT` | 默认 7860（Spaces 要求） |

## 本地运行

```bash
pip install -r server/requirements.txt
python server/app.py
```

打开 http://127.0.0.1:5007 ；知识库只读页在 `/kb`。
