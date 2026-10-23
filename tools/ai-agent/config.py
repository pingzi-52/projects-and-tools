# -*- coding: utf-8 -*-
"""
统一配置管理 - AI 聚合平台
优先级：环境变量 > .env 文件 > 硬编码默认值

用法:
    from config import BACKENDS, AGNES_KEY, ...
"""
import os
from pathlib import Path

# ============================================================
# 加载 .env 文件（如果存在）
# ============================================================
ENV_PATH = Path(__file__).parent / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("\"'")
        if key and not os.environ.get(key):
            os.environ[key] = val

# ============================================================
# API Keys（环境变量 > 默认值）
# ============================================================
AGNES_KEY = os.environ.get("AGNES_API_KEY") or ""
SILICON_KEY = os.environ.get("SILICON_API_KEY") or ""
ZHIPU_KEY = os.environ.get("ZHIPU_API_KEY") or ""
KIMI_KEY = os.environ.get("KIMI_API_KEY") or ""
CC_KEY = os.environ.get("CC_API_KEY") or ""
OR_KEY = os.environ.get("OR_API_KEY") or ""

# ============================================================
# API Base URLs
# ============================================================
AGNES_BASE = "https://apihub.agnes-ai.com/v1"
SILICON_BASE = "https://api.siliconflow.cn/v1"
ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4"
KIMI_BASE = "https://api.moonshot.cn/v1"
CC_BASE = "http://127.0.0.1:15721/v1"
OR_BASE = "https://openrouter.ai/api/v1"

# ============================================================
# 后端配置（兼容 agent.py 原有的 CONFIG 格式）
# ============================================================
BACKENDS = {
    "cc_switch": {
        "url": CC_BASE + "/chat/completions",
        "api_key": CC_KEY,
        "model": "deepseek-v4-flash",
        "extra_headers": {"anthropic-version": "2023-06-01"}
    },
    "agnes": {
        "url": AGNES_BASE + "/chat/completions",
        "api_key": AGNES_KEY,
        "model": "agnes-2.5-flash"
    },
    "kimi": {
        "url": KIMI_BASE + "/chat/completions",
        "api_key": KIMI_KEY,
        "model": "kimi-k2.6"
    },
    "silicon": {
        "url": SILICON_BASE + "/chat/completions",
        "api_key": SILICON_KEY,
        "model": "Qwen/Qwen2.5-7B-Instruct"
    },
    "zhipu": {
        "url": ZHIPU_BASE + "/chat/completions",
        "api_key": ZHIPU_KEY,
        "model": "glm-4-flash"
    },
    "or": {
        "url": OR_BASE + "/chat/completions",
        "api_key": OR_KEY,
        "model": "nvidia/nemotron-3-ultra-550b-a55b:free"
    },
}

# 后端显示名称
BACKEND_NAMES = {
    "cc_switch": "cc-switch DeepSeek V4 Flash",
    "agnes": "Agnes 2.5 Flash（免费）",
    "kimi": "Kimi K2.6（¥15）",
    "silicon": "硅基流动 Qwen2.5-7B（免费额度）",
    "zhipu": "智谱 GLM-4-Flash（免费）",
    "or": "OpenRouter Nemotron Ultra 550B（免费）",
}

# ============================================================
# SMTP 配置（发邮件用）
# ============================================================
SMTP_HOST = os.environ.get("SMTP_HOST") or "smtp.qq.com"
SMTP_PORT = int(os.environ.get("SMTP_PORT") or "587")
SMTP_USER = os.environ.get("SMTP_USER") or "2115499131@qq.com"
SMTP_PASS = os.environ.get("SMTP_PASS") or "pukffeuviqfkjbbj"

# ============================================================
# 其他全局配置
# ============================================================
# agent 目录
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
