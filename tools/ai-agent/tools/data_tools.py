# -*- coding: utf-8 -*-
"""
数据处理工具模块
工具列表: query_database, generate_chart, format_json
"""
import json
import os
from datetime import datetime

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_database",
            "description": "查询SQLite数据库",
            "parameters": {
                "type": "object",
                "properties": {
                    "db_path": {"type": "string", "description": "数据库文件路径"},
                    "sql": {"type": "string", "description": "SQL查询语句"}
                },
                "required": ["db_path", "sql"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_chart",
            "description": "根据数据生成图表并保存为图片",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "图表标题"},
                    "labels": {"type": "string", "description": "标签列表，用逗号分隔，如 一月,二月,三月"},
                    "values": {"type": "string", "description": "数值列表，用逗号分隔，如 100,200,150"},
                    "chart_type": {"type": "string", "description": "图表类型：bar=柱状图, line=折线图, pie=饼图"},
                    "save_path": {"type": "string", "description": "保存路径，不指定则保存到agent目录"}
                },
                "required": ["title", "labels", "values"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "format_json",
            "description": "格式化/压缩/验证JSON数据",
            "parameters": {
                "type": "object",
                "properties": {
                    "input": {"type": "string", "description": "JSON字符串"},
                    "action": {"type": "string", "description": "format=格式化, validate=验证, minify=压缩, sort=排序"}
                },
                "required": ["input", "action"]
            }
        }
    },
]


def execute(tool_name, args):
    """执行本模块的工具"""
    if tool_name == "query_database":
        try:
            import sqlite3
            db_path = args.get("db_path", "").replace("\\", "/")
            sql = args.get("sql", "")
            if not os.path.exists(db_path):
                return json.dumps({"error": "数据库不存在: " + db_path}, ensure_ascii=False)
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            statements = [s.strip() for s in sql.replace("\n", " ").split(";") if s.strip()]
            results = []
            for stmt in statements:
                try:
                    cur.execute(stmt)
                    if stmt.upper().startswith("SELECT"):
                        rows = cur.fetchall()
                        if rows:
                            cols = [desc[0] for desc in cur.description]
                            data = [dict(r) for r in rows]
                            results.append({"type": "select", "columns": cols, "rows": data})
                        else:
                            results.append({"type": "select", "columns": [], "rows": []})
                    else:
                        affected = cur.rowcount
                        results.append({"type": "execute", "affected_rows": max(0, affected)})
                except Exception as stmt_err:
                    results.append({"type": "error", "statement": stmt[:80], "error": str(stmt_err)})
            conn.commit()
            conn.close()
            return json.dumps({"results": results, "sql_preview": sql[:100]}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "数据库查询失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "generate_chart":
        try:
            from PIL import Image, ImageDraw, ImageFont
            import math
            title = args.get("title", "图表")
            labels_str = args.get("labels", "")
            values_str = args.get("values", "")
            chart_type = args.get("chart_type", "bar")
            labels = [x.strip() for x in labels_str.split(",") if x.strip()]
            values = [float(x.strip()) for x in values_str.split(",") if x.strip()]
            if not labels or not values:
                return json.dumps({"error": "标签或数值不能为空"}, ensure_ascii=False)

            w, h = 800, 500
            img = Image.new("RGB", (w, h), "white")
            draw = ImageDraw.Draw(img)
            draw.text((w // 2 - len(title) * 7, 15), title, fill="black")

            if chart_type == "pie":
                colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"]
                total = sum(values)
                start = 0
                cx, cy, r = w // 2, h // 2 + 30, 150
                for i, v in enumerate(values):
                    angle = 360 * v / total
                    draw.pieslice([cx - r, cy - r, cx + r, cy + r], start, start + angle, fill=colors[i % len(colors)], outline="white")
                    mid = start + angle / 2
                    lx = cx + int(r * 0.6 * math.cos(math.radians(mid)))
                    ly = cy + int(r * 0.6 * math.sin(math.radians(mid)))
                    draw.text((lx - 10, ly - 5), labels[i] + "\n" + str(int(v)), fill="black")
                    start += angle
            else:
                margin_l, margin_r, margin_t, margin_b = 80, 40, 60, 80
                chart_w = w - margin_l - margin_r
                chart_h = h - margin_t - margin_b
                max_val = max(values) if values else 1
                bar_w = min(60, chart_w // len(values) - 10)
                colors = ["#4ECDC4", "#45B7D1", "#96CEB4", "#FF6B6B", "#FFEAA7", "#DDA0DD"]
                for i, (label, val) in enumerate(zip(labels, values)):
                    bar_h = int(chart_h * val / max_val)
                    x = margin_l + i * (chart_w // len(values))
                    y = margin_t + chart_h - bar_h
                    draw.rectangle([x, y, x + bar_w, y + bar_h], fill=colors[i % len(colors)])
                    draw.text((x, margin_t + chart_h + 5), label, fill="black")
                    draw.text((x, y - 20), str(int(val)), fill="black")
                draw.line([margin_l, margin_t, margin_l, margin_t + chart_h], fill="gray")
                draw.line([margin_l, margin_t + chart_h, w - margin_r, margin_t + chart_h], fill="gray")
                for i in range(5):
                    y = margin_t + chart_h - i * chart_h // 4
                    draw.text((5, y - 7), str(int(max_val * i // 4)), fill="gray")

            save_path = args.get("save_path", "")
            if not save_path:
                agent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                save_path = os.path.join(agent_dir, "图表_" + str(int(datetime.now().timestamp())) + ".png")
            img.save(save_path)
            return json.dumps({"success": True, "chart": save_path, "chart_type": chart_type,
                              "labels": labels, "values": values}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "生成图表失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "format_json":
        try:
            inp = args.get("input", "")
            action = args.get("action", "format")
            parsed = json.loads(inp)
            if action == "validate":
                return json.dumps({"valid": True, "type": str(type(parsed).__name__)}, ensure_ascii=False)
            elif action == "minify":
                result = json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)
            elif action == "sort":
                if isinstance(parsed, dict):
                    parsed = dict(sorted(parsed.items()))
                result = json.dumps(parsed, indent=2, ensure_ascii=False)
            else:
                result = json.dumps(parsed, indent=2, ensure_ascii=False)
            return json.dumps({"action": action, "result": result[:3000]}, ensure_ascii=False)
        except json.JSONDecodeError as e:
            return json.dumps({"valid": False, "error": str(e)}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    return None
