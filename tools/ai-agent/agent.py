# -*- coding: utf-8 -*-
"""Agent 核心 - 多模型支持的工具调用框架
支持 cc-switch DeepSeek V4 Flash、Agnes、智谱 GLM-4、硅基流动、Kimi 等模型
"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
import requests
from datetime import datetime
import sys as _sys
import os
import base64
from pathlib import Path

# ============================================================
# 从统一配置加载
# ============================================================
from config import BACKENDS, BACKEND_NAMES, AGENT_DIR

# ============================================================
# 从工具模块加载
# ============================================================
from tools import ALL_TOOLS as TOOL_DEFINITIONS, execute_tool

# ============================================================
# 后端可用性缓存
# ============================================================
_AVAILABLE_BACKENDS = None

def _get_available_backends():
    """获取所有非占位的可用后端"""
    global _AVAILABLE_BACKENDS
    if _AVAILABLE_BACKENDS is None:
        _AVAILABLE_BACKENDS = {}
        for key, cfg in BACKENDS.items():
            if not cfg.get("placeholder"):
                _AVAILABLE_BACKENDS[key] = cfg
    return _AVAILABLE_BACKENDS

# ============================================================
# API 调用
# ============================================================
def chat_completion(messages, tools=None, backend="cc_switch", model_name=None):
    """调用模型 API，支持多个后端"""
    cfg = BACKENDS.get(backend)
    if cfg is None:
        print("  [错误] 未知后端: " + backend)
        return None

    body = {
        "model": model_name or cfg.get("model", "gpt-3.5-turbo"),
        "messages": messages,
        "max_tokens": 4096,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + cfg["api_key"]
    }
    extra = cfg.get("extra_headers")
    if extra:
        headers.update(extra)

    resp = requests.post(cfg["url"], json=body, headers=headers, timeout=120)
    if resp.status_code != 200:
        print("  [错误] HTTP " + str(resp.status_code) + ": " + resp.text[:200])
        return None
    return resp.json()


# ============================================================
# Agent 主循环
# ============================================================
def run_agent(user_input, backend="cc_switch", model_name=None, image_path=None, max_turns=10):
    """
    Agent 主循环：
    1. 发送消息 + 工具列表给模型
    2. 模型决定直接回复或调用工具
    3. 如果调用工具 -> 执行 -> 返回结果 -> 回到步骤1
    4. 直到模型直接回复
    """
    system_prompt = """你是全能 AI 助手，可以使用工具来回答问题。
调用工具时会先思考需要什么信息，然后精确调用。
当你已有足够的信息时，请用中文直接回答用户。"""

    # 构建用户消息（文本 + 可选图片）
    user_content = []
    if image_path:
        path = Path(image_path)
        if not path.exists():
            print("  [错误] 图片不存在: " + image_path)
            return None
        suffix = path.suffix.lower()
        mime_map = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}
        mime_type = mime_map.get(suffix.lstrip("."), "image/png")
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        user_content.append({"type": "image_url", "image_url": {"url": "data:" + mime_type + ";base64," + b64}})
        print("  [图片] " + path.name + " (" + str(len(b64) // 1024) + "KB)")
    if user_content:
        user_content.insert(0, {"type": "text", "text": user_input})
    else:
        user_content = user_input

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]

    # 显示后端信息
    names = BACKEND_NAMES
    model_label = model_name or BACKENDS.get(backend, {}).get("model", "default")
    print("  [" + names.get(backend, backend) + " / " + model_label + "]")
    print("  " + "=" * 40)

    for turn in range(max_turns):
        # 调用模型
        result = chat_completion(messages, tools=TOOL_DEFINITIONS, backend=backend, model_name=model_name)
        if not result:
            return None

        choice = result["choices"][0]
        msg = choice["message"]
        finish = choice.get("finish_reason", "")

        # 取出思考过程（DeepSeek 专有字段）
        reasoning = msg.get("reasoning_content") or msg.get("reasoning") or ""
        if reasoning:
            print("  [思考] " + reasoning[:300])

        # 转存 assistant 回复
        assistant_msg = {"role": "assistant", "content": msg.get("content", "")}

        if finish == "tool_calls" and msg.get("tool_calls"):
            # 模型要调用工具
            tool_calls = msg["tool_calls"]
            print("  [工具调用] " + str(len(tool_calls)) + " 个工具请求")

            # 保存 assistant 消息（含 tool_calls）
            assistant_msg["tool_calls"] = tool_calls
            messages.append(assistant_msg)

            for tc in tool_calls:
                func = tc["function"]
                tool_name = func["name"]
                try:
                    args = json.loads(func["arguments"])
                except json.JSONDecodeError:
                    args = {}
                print("    -> 调用: " + tool_name + "(" + json.dumps(args, ensure_ascii=False) + ")")

                tool_result = execute_tool(tool_name, args)
                print("    <- 结果: " + tool_result[:150])

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": tool_result
                })

        elif finish == "stop" or not msg.get("tool_calls"):
            # 模型直接回复
            messages.append(assistant_msg)
            content = msg.get("content", "")
            if content:
                print("\n  [回复] " + content)
            else:
                print("\n  [回复]（无内容）")
            return content

    print("\n  [结束] 达到最大轮数 " + str(max_turns))
    return None


# ============================================================
# 交互模式
# ============================================================
def interactive():
    print()
    print("=" * 50)
    print("  Agent 智能体 - 多模型工具调用")
    print("=" * 50)
    print("  支持命令:")
    print("    /backend cc      切换后端为 cc-switch DeepSeek V4 Flash")
    print("    /backend agnes   切换后端为 Agnes 2.5 Flash（免费）")
    print("    /backend zhipu   切换后端为 智谱 GLM-4-Flash（免费）")
    print("    /backend silicon 切换后端为 硅基流动 Qwen2.5-7B（免费额度）")
    print("    /backend kimi    切换后端为 Kimi K2.6（¥15代金券）")
    print("    /backend or      切换后端为 OpenRouter Nemotron Ultra 550B（免费）")
    print("    /status          查看当前后端")
    print("    /backends        列出所有可用后端")
    print("    /quit            退出")
    print()

    backend = "cc_switch"
    model_name = None
    backend_map = {
        "cc": ("cc_switch", None),
        "agnes": ("agnes", None),
        "silicon": ("silicon", None),
        "zhipu": ("zhipu", None),
        "kimi": ("kimi", None),
        "or": ("or", None),
    }

    while True:
        try:
            inp = input("你 > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n退出")
            break

        if not inp:
            continue
        if inp == "/quit":
            break
        if inp == "/status":
            label = model_name or BACKENDS.get(backend, {}).get("model", "default")
            print("  当前后端: " + BACKEND_NAMES.get(backend, backend) + " / " + label)
            continue
        if inp == "/backends":
            print("  可用后端:")
            for key, cfg in BACKENDS.items():
                placeholder = cfg.get("placeholder", False)
                status = "（占位）" if placeholder else "（可用）"
                name = BACKEND_NAMES.get(key, key)
                model = cfg.get("model", "?")
                print("    " + key + " - " + name + " [" + model + "] " + status)
            continue
        if inp.startswith("/backend "):
            key = inp.split(" ", 1)[1]
            if key in backend_map:
                backend, model_name = backend_map[key]
                print("  已切换至 " + BACKEND_NAMES.get(backend, backend))
            else:
                print("  未知后端，可用: cc agnes silicon zhipu kimi or")
            continue

        print()
        run_agent(inp, backend=backend, model_name=model_name)
        print()


# ============================================================
# 入口
# ============================================================
if __name__ == "__main__":
    # 单条模式: python agent.py "查天气" [--agnes] [--img 图片.png]
    if len(_sys.argv) > 1 and _sys.argv[1] not in ("-i", "--interactive"):
        query = " ".join(_sys.argv[1:])
        backend = "cc_switch"
        model_name = None
        image_path = None
        if "--img" in _sys.argv:
            idx = _sys.argv.index("--img")
            if idx + 1 < len(_sys.argv):
                image_path = _sys.argv[idx + 1]
        if "--agnes" in _sys.argv:
            backend = "agnes"
        elif "--zhipu" in _sys.argv:
            backend = "zhipu"
        elif "--silicon" in _sys.argv:
            backend = "silicon"
        elif "--kimi" in _sys.argv:
            backend = "kimi"
        elif "--or" in _sys.argv:
            backend = "or"
        run_agent(query, backend=backend, model_name=model_name, image_path=image_path)
    else:
        interactive()
