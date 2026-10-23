# -*- coding: utf-8 -*-
"""
AI 增强工具模块
工具列表: translate_text, generate_image, vision
"""
import json
import os
import base64
from datetime import datetime
from pathlib import Path

# 从统一配置读取
from config import BACKENDS, AGENT_DIR

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "translate_text",
            "description": "中英互译，调用 AI 自动翻译",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "要翻译的文本"},
                    "target_lang": {"type": "string", "description": "目标语言，zh=中文，en=英文"}
                },
                "required": ["text", "target_lang"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "根据文字描述生成图片，返回图片保存路径",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "图片描述词，中英文均可"},
                    "engine": {
                        "type": "string",
                        "description": "生成引擎：agnes（免费，默认）或 doubao（需Key）",
                        "default": "agnes"
                    }
                },
                "required": ["prompt"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "vision",
            "description": "识别图片内容，用文字描述图片",
            "parameters": {
                "type": "object",
                "properties": {
                    "image_path": {"type": "string", "description": "图片文件路径"},
                    "prompt": {"type": "string", "description": "提问内容，如'这张图里有什么'，默认'请描述这张图片'"}
                },
                "required": ["image_path"]
            }
        }
    },
]


def execute(tool_name, args):
    """执行本模块的工具"""
    if tool_name == "translate_text":
        try:
            import requests
            text = args.get("text", "")
            target = args.get("target_lang", "zh")
            lang_map = {"zh": "中文", "en": "英文"}
            lang = lang_map.get(target, target)
            # 用 Kimi 做翻译
            cfg = BACKENDS.get("kimi")
            if not cfg:
                return json.dumps({"error": "翻译服务不可用（Kimi后端未配置）"}, ensure_ascii=False)
            resp = requests.post(cfg["url"], headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + cfg["api_key"]
            }, json={
                "model": cfg["model"],
                "messages": [{"role": "user", "content": "请将以下文本翻译为" + lang + "，只返回翻译结果，不要解释：\n\n" + text}],
                "max_tokens": 1024
            }, timeout=30)
            d = resp.json()
            result_text = d["choices"][0]["message"]["content"]
            return json.dumps({"original": text, "translation": result_text, "target": lang}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "翻译失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "generate_image":
        try:
            import requests
            prompt = args.get("prompt", "")
            engine = args.get("engine", "agnes")

            if engine == "agnes":
                cfg = BACKENDS.get("agnes")
                if not cfg:
                    return json.dumps({"error": "Agnes 后端未配置"}, ensure_ascii=False)
                base_url = cfg["url"].replace("/chat/completions", "")
                resp = requests.post(
                    base_url + "/images/generations",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + cfg["api_key"]
                    },
                    json={
                        "model": "agnes-image-2.1-flash",
                        "prompt": prompt,
                        "size": "1024x1024",
                        "response_format": "b64_json"
                    },
                    timeout=120
                )
                if resp.status_code != 200:
                    return json.dumps({"error": "生图失败: " + resp.text[:200]}, ensure_ascii=False)
                data = resp.json()["data"][0]
                if data.get("b64_json"):
                    img_bytes = base64.b64decode(data["b64_json"])
                elif data.get("url"):
                    img_resp = requests.get(data["url"], timeout=120)
                    img_bytes = img_resp.content
                else:
                    return json.dumps({"error": "未知响应格式"}, ensure_ascii=False)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                save_path = os.path.join(AGENT_DIR, "ai_img_" + timestamp + ".png")
                with open(save_path, "wb") as f:
                    f.write(img_bytes)
                return json.dumps({"success": True, "file": save_path, "engine": "agnes"}, ensure_ascii=False)
            else:
                return json.dumps({"error": "未知引擎: " + engine + "，可用: agnes"}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "生图失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "vision":
        try:
            import requests
            image_path = args.get("image_path", "").replace("\\", "/")
            prompt = args.get("prompt", "")
            if not prompt:
                prompt = "请用中文描述这张图片"

            path = Path(image_path)
            if not path.exists():
                return json.dumps({"error": "图片不存在: " + image_path}, ensure_ascii=False)

            with open(path, "rb") as f:
                raw = f.read()

            # 大图压缩
            if len(raw) > 500 * 1024:
                try:
                    from PIL import Image
                    import io
                    img = Image.open(io.BytesIO(raw))
                    w, h = img.size
                    if w > 1024 or h > 1024:
                        scale = min(1024 / w, 1024 / h)
                        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
                        buf = io.BytesIO()
                        img.save(buf, format="PNG")
                        raw = buf.getvalue()
                except:
                    pass

            suffix = path.suffix.lower()
            mime_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                        ".gif": "image/gif", ".webp": "image/webp"}
            mime_type = mime_map.get(suffix, "image/png")
            b64 = base64.b64encode(raw).decode()
            b64_url = "data:" + mime_type + ";base64," + b64

            cfg = BACKENDS.get("agnes")
            if not cfg:
                return json.dumps({"error": "识图服务不可用（Agnes 后端未配置）"}, ensure_ascii=False)

            resp = requests.post(cfg["url"], headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + cfg["api_key"]
            }, json={
                "model": "agnes-2.5-flash",
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": b64_url}}
                ]}],
                "max_tokens": 1024
            }, timeout=60)

            if resp.status_code != 200:
                return json.dumps({"error": "识图失败: " + resp.text[:200]}, ensure_ascii=False)
            result = resp.json()["choices"][0]["message"]["content"]
            return json.dumps({"result": result}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "识图失败: " + str(e)}, ensure_ascii=False)

    return None
