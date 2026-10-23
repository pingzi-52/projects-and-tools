# -*- coding: utf-8 -*-
"""
基础工具模块
工具列表: get_time, calculator, encode_decode, count_tokens, find_files
"""
import json
import base64
import urllib.parse
import random
import string
import os
import fnmatch
from datetime import datetime

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_time",
            "description": "获取当前日期和时间",
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {"type": "string", "description": "时区，如 Asia/Shanghai", "default": "Asia/Shanghai"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "执行数学计算，支持 + - * / 和数学函数",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "数学表达式，如 12 * (3 + 5)"}
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "encode_decode",
            "description": "文本编码/解码，支持base64和URL编码",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "要编码/解码的文本"},
                    "action": {"type": "string", "description": "操作：base64_encode, base64_decode, url_encode, url_decode"},
                    "format": {"type": "string", "description": "输出格式，默认utf-8"}
                },
                "required": ["text", "action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "count_tokens",
            "description": "统计文本的字数和估算token数",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "要统计的文本"}
                },
                "required": ["text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "find_files",
            "description": "搜索目录下的文件，支持通配符",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "搜索目录路径"},
                    "pattern": {"type": "string", "description": "文件名模式，如 *.py, *.txt, *test*"},
                    "max_results": {"type": "integer", "description": "最多返回结果数，默认20"}
                },
                "required": ["directory"]
            }
        }
    },
]


def execute(tool_name, args):
    """执行本模块的工具"""
    if tool_name == "get_time":
        now = datetime.now()
        return json.dumps({
            "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
            "weekday": ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
        }, ensure_ascii=False)

    elif tool_name == "calculator":
        try:
            allowed = set("0123456789+-*/.()% ")
            expr = args.get("expression", "")
            if not all(c in allowed for c in expr):
                return json.dumps({"error": "表达式包含非法字符"}, ensure_ascii=False)
            result = eval(expr, {"__builtins__": {}}, {})
            return json.dumps({"expression": expr, "result": result}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "encode_decode":
        try:
            text = args.get("text", "")
            action = args.get("action", "")
            if action == "base64_encode":
                result = base64.b64encode(text.encode()).decode()
            elif action == "base64_decode":
                result = base64.b64decode(text).decode("utf-8", errors="replace")
            elif action == "url_encode":
                result = urllib.parse.quote(text)
            elif action == "url_decode":
                result = urllib.parse.unquote(text)
            else:
                result = "未知操作: " + action
            return json.dumps({"action": action, "result": result[:500]}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "count_tokens":
        try:
            text = args.get("text", "")
            char_count = len(text)
            word_count_en = len(text.split())
            cn_chars = sum(1 for c in text if ord(c) > 127)
            en_chars = char_count - cn_chars
            estimated_tokens = int(cn_chars / 1.5 + en_chars / 4)
            return json.dumps({
                "chars": char_count,
                "english_words": word_count_en,
                "estimated_tokens": estimated_tokens
            }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "find_files":
        try:
            directory = args.get("directory", "").replace("\\", "/")
            pattern = args.get("pattern", "*")
            max_results = args.get("max_results", 20)
            if not os.path.isdir(directory):
                return json.dumps({"error": "目录不存在: " + directory}, ensure_ascii=False)
            results = []
            for root, dirs, files in os.walk(directory):
                dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules" and d != "__pycache__"]
                for fname in files:
                    if fnmatch.fnmatch(fname, pattern):
                        fpath = os.path.join(root, fname)
                        try:
                            size = os.path.getsize(fpath)
                            results.append({"path": fpath, "size": size, "size_str": format_size(size)})
                        except:
                            results.append({"path": fpath, "size": 0, "size_str": "?"})
                        if len(results) >= max_results:
                            break
                if len(results) >= max_results:
                    break
            return json.dumps({
                "directory": directory,
                "pattern": pattern,
                "total": len(results),
                "files": results
            }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "搜索文件失败: " + str(e)}, ensure_ascii=False)

    return None


def format_size(size):
    """格式化文件大小显示"""
    if size < 1024:
        return str(size) + " B"
    elif size < 1024 * 1024:
        return str(round(size / 1024, 1)) + " KB"
    else:
        return str(round(size / 1024 / 1024, 1)) + " MB"
