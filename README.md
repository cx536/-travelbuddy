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

## 部署到魔搭 ModelScope 创空间（推荐，国内免费直连）

1. 登录 https://www.modelscope.cn ，绑定阿里云账号并完成实名认证（Docker 创空间仅对实名用户开放）。
2. 打开 https://www.modelscope.cn/studios/create ，SDK 选 **Docker**，名称填 `travelbuddy`，可见性选 **公开**。
3. 把本目录（`Dockerfile`、`server/`、`public/`、`README.md`）推到该创空间仓库的 master 分支。
4. 创空间「设置」页 → **上线**，等待构建完成（构建期会建好 430 条向量库）。
5. 访问 `https://www.modelscope.cn/studios/<用户名>/travelbuddy`。

> 平台要求服务监听 `0.0.0.0:7860`（本项目默认如此）；构建期环境变量不可用，`DEEPSEEK_API_KEY` 在「设置 → 环境变量」里按运行时注入。

## 部署到 Hugging Face Spaces（备用，国内需代理）

1. 打开 https://huggingface.co/new-space ，SDK 选 **Docker**、模板 **Blank**、可见性 **Public**。
2. **Settings → Variables and secrets** 添加 Secret：`DEEPSEEK_API_KEY`。
3. 推送本目录到 Space 仓库，构建完成后访问 `https://<用户名>-travelbuddy.hf.space`。

> 向量库在镜像构建阶段自动建立（430 条文档），无需手动 `ingest`。

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
