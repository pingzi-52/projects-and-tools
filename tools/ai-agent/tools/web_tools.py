# -*- coding: utf-8 -*-
"""
网络工具模块
工具列表: web_search, web_crawl, take_screenshot, get_weather
"""
import json
import os
import subprocess
import re as _re
import tempfile
import base64
import glob

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "搜索网页获取最新信息（用Edge浏览器）",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市当前天气（实时数据）",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名，如 北京、上海"}
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "take_screenshot",
            "description": "打开网页并截图（用Edge浏览器），返回截图保存路径",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "网页地址，如 https://www.baidu.com"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_crawl",
            "description": "爬取网页内容，读取网址的文字信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "网页地址"}
                },
                "required": ["url"]
            }
        }
    },
]


def execute(tool_name, args):
    """执行本模块的工具"""
    if tool_name == "web_search":
        try:
            query = args.get("query", "")
            script = os.path.expanduser("~/.claude/skills/web-control/scripts/browser_control.py")
            result = subprocess.run(
                ["python", script, "search_baidu", query],
                capture_output=True, timeout=120
            )
            out = result.stdout.decode("utf-8", errors="replace")
            try:
                start = out.index("{")
                end = out.rindex("}") + 1
                data = json.loads(out[start:end])
                items = data.get("results", [])
                if items:
                    titles = [r.get("title", "") for r in items if r.get("title")]
                    if titles:
                        return json.dumps({"results": titles[:5]}, ensure_ascii=False)
            except:
                pass
            return json.dumps({"note": "搜索暂时不可用"}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "搜索失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "get_weather":
        try:
            import requests
            city = args.get("city", "北京")
            resp = requests.get(
                "https://wttr.in/" + requests.utils.quote(city) + "?format=%C+%t+%h&lang=zh",
                headers={"User-Agent": "curl"}, timeout=10
            )
            if resp.status_code == 200:
                data = resp.text.strip()
                return json.dumps({"city": city, "weather": data}, ensure_ascii=False)
            return json.dumps({"city": city, "note": "获取天气失败"}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"city": city, "note": "获取天气失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "take_screenshot":
        try:
            url = args.get("url", "")
            script = os.path.expanduser("~/.claude/skills/web-control/scripts/browser_control.py")
            result = subprocess.run(
                ["python", script, "screenshot", url],
                capture_output=True, timeout=60
            )
            out = result.stdout.decode("utf-8", errors="replace")
            agent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            from datetime import datetime
            local_path = os.path.join(agent_dir, "网页截图_" + str(int(datetime.now().timestamp())) + ".png")
            b64_match = _re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", out)
            if b64_match:
                img_data = base64.b64decode(b64_match.group(1))
                with open(local_path, "wb") as f:
                    f.write(img_data)
                return json.dumps({"url": url, "screenshot": local_path}, ensure_ascii=False)
            screenshots = sorted(
                glob.glob(os.path.join(tempfile.gettempdir(), "screenshot-*.png")),
                key=os.path.getmtime, reverse=True
            )
            if screenshots:
                return json.dumps({"url": url, "screenshot": screenshots[0]}, ensure_ascii=False)
            return json.dumps({"note": "截图生成失败"}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "截图失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "web_crawl":
        try:
            url = args.get("url", "")
            script = os.path.expanduser("~/.claude/skills/web-control/scripts/browser_control.py")
            result = subprocess.run(
                ["python", script, "open", url],
                capture_output=True, timeout=60
            )
            out = result.stdout.decode("utf-8", errors="replace")
            try:
                data = json.loads(out)
                text = data.get("content", data.get("text", ""))
                if not text:
                    text = data.get("title", "") + "\n" + "".join(data.get("results", []))
            except:
                text = out[:2000]
            if len(text) > 4000:
                text = text[:4000] + "\n...（截断）"
            return json.dumps({"url": url, "content": text}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    return None
