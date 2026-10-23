# -*- coding: utf-8 -*-
"""
实用工具模块
工具列表: generate_password, generate_qrcode, send_email, watch_folder, start_webui
"""
import json
import os
import random
import string
import glob
from datetime import datetime
from config import AGENT_DIR, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "generate_password",
            "description": "生成随机密码",
            "parameters": {
                "type": "object",
                "properties": {
                    "length": {"type": "integer", "description": "密码长度，默认16"},
                    "include_symbols": {"type": "boolean", "description": "是否包含特殊字符，默认true"},
                    "count": {"type": "integer", "description": "生成几个密码，默认1"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_qrcode",
            "description": "生成二维码图片",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "二维码内容，如网址或文本"},
                    "save_path": {"type": "string", "description": "保存路径，不指定则保存到agent目录"}
                },
                "required": ["text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": "通过本地SMTP发送邮件",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "收件人邮箱"},
                    "subject": {"type": "string", "description": "邮件主题"},
                    "body": {"type": "string", "description": "邮件正文"}
                },
                "required": ["to", "subject", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "watch_folder",
            "description": "监控文件夹，查看最近文件变动",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "要监控的文件夹路径"},
                    "file_types": {"type": "string", "description": "文件类型，如 .csv,.txt"}
                },
                "required": ["folder"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "start_webui",
            "description": "启动网页界面，在浏览器里使用Agent",
            "parameters": {
                "type": "object",
                "properties": {
                    "port": {"type": "integer", "description": "端口号，默认7860"}
                }
            }
        }
    },
]


def execute(tool_name, args):
    """执行本模块的工具"""
    if tool_name == "generate_password":
        try:
            length = args.get("length", 16)
            include_symbols = args.get("include_symbols", True)
            count = args.get("count", 1)
            chars = string.ascii_letters + string.digits
            if include_symbols:
                chars = chars + "!@#$%^&*()-_=+"
            passwords = []
            for _ in range(count):
                pw = "".join(random.choice(chars) for _ in range(length))
                passwords.append(pw)
            return json.dumps({"passwords": passwords, "length": length, "count": count}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "generate_qrcode":
        try:
            import qrcode
            text = args.get("text", "")
            save_path = args.get("save_path", "")
            if not save_path:
                save_path = os.path.join(AGENT_DIR, "qrcode_" + str(int(datetime.now().timestamp())) + ".png")
            img = qrcode.make(text)
            img.save(save_path)
            return json.dumps({"success": True, "file": save_path, "content": text[:100]}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "send_email":
        try:
            import smtplib
            from email.mime.text import MIMEText
            to = args.get("to", "")
            subject = args.get("subject", "")
            body = args.get("body", "")
            msg = MIMEText(body, "plain", "utf-8")
            msg["Subject"] = subject
            msg["From"] = SMTP_USER
            msg["To"] = to
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, [to], msg.as_string())
            server.quit()
            return json.dumps({"success": True, "to": to, "subject": subject}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "发邮件失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "watch_folder":
        try:
            folder = args.get("folder", "").replace("\\", "/")
            file_types = args.get("file_types", "")
            if not os.path.isdir(folder):
                return json.dumps({"error": "文件夹不存在: " + folder}, ensure_ascii=False)
            types = [t.strip() for t in file_types.split(",") if t.strip()] if file_types else []
            files = []
            for f in os.listdir(folder):
                fp = os.path.join(folder, f)
                if os.path.isfile(fp):
                    if types:
                        ext = os.path.splitext(f)[1].lower()
                        if ext not in types:
                            continue
                    files.append({"name": f, "size": os.path.getsize(fp), "modified": os.path.getmtime(fp)})
            files.sort(key=lambda x: x["modified"], reverse=True)
            return json.dumps({"folder": folder, "file_count": len(files), "recent_files": files[:10]}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "start_webui":
        try:
            port = args.get("port", 7860)
            import subprocess
            script = """
import gradio as gr
import subprocess, sys, os, json
agent_dir = os.path.dirname(os.path.abspath(__file__))
def ask(text):
    try:
        r = subprocess.run([sys.executable, os.path.join(agent_dir, "agent.py"), text, "--agnes"], capture_output=True, text=True, timeout=120)
        return r.stdout[-2000:] or "无输出"
    except Exception as e:
        return str(e)
def see(img):
    try:
        r = subprocess.run([sys.executable, os.path.join(agent_dir, "see.py"), img], capture_output=True, text=True, timeout=60)
        return r.stdout[-2000:] or "无输出"
    except:
        return "失败"
with gr.Blocks(title="AI Agent", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# AI 工具箱")
    with gr.Tab("AI 问答"):
        t = gr.Textbox(label="输入问题")
        b = gr.Button("发送")
        o = gr.Textbox(label="回答")
        b.click(ask, t, o)
    with gr.Tab("识图"):
        i = gr.Image(type="filepath", label="上传图片")
        b2 = gr.Button("识别")
        o2 = gr.Textbox(label="结果")
        b2.click(see, i, o2)
demo.launch(server_port=%d, server_name="0.0.0.0")
""" % port
            import tempfile
            f = tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8")
            f.write(script)
            f.close()
            subprocess.Popen([sys.executable, f.name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return json.dumps({"success": True, "url": "http://localhost:" + str(port), "port": port}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    return None
