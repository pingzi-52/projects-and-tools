# -*- coding: utf-8 -*-
"""
AI 识图统一工具
支持：截图文件 / 指定图片 / 剪贴板图片 / 图片URL
识别引擎：Agnes（免费）/ 豆包（按量）

用法：
  # 查看截图目录
  python vision_helper.py

  # 识别指定截图
  python vision_helper.py screenshot.png
  python vision_helper.py screenshot.png --mode text

  # 识别任意图片
  python vision_helper.py 图片路径.jpg

  # 粘贴图片后，一键从剪贴板抓取识别 ✨
  python vision_helper.py --clipboard
  python vision_helper.py --clipboard --mode text

  # 交互模式
  python vision_helper.py --interactive

参数：
  --mode       描述 | text | 代码 | 自定义提示词
                 描述  → 详细描述图片内容（默认）
                 text  → 提取图中所有文字（OCR）
                 代码  → 识别图中的代码
                 其他  → 作为自定义提示词
  --engine     agnes | doubao    使用哪个 AI 引擎（默认 agnes 免费）
  --save       识别结果同时保存到 txt 文件
  --clipboard  从剪贴板抓取图片并识别
  --interactive, -i  进入交互模式
"""
import argparse
import base64
import io
import os
import re
import subprocess
import sys
import uuid

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ============================================================
# 配置
# ============================================================
SCREENSHOT_DIR = "F:/ClaudeWork/screenshots"

# --- Agnes（免费）---
AGNES_KEY = os.getenv("AGNES_KEY", "")
AGNES_URL = "https://apihub.agnes-ai.com/v1"

# --- 豆包（按量付费）---
ARK_KEY = os.getenv("ARK_KEY", "")
ARK_URL = "https://ark.cn-beijing.volces.com/api/v3"
ARK_VISION_MODEL = "doubao-1.5-vision-pro-32k"

SUPPORTED_EXT = ('.png', '.jpg', '.jpeg', '.webp', '.bmp')

# ============================================================
# 预设提示词模板
# ============================================================
PROMPT_TEMPLATES = {
    "描述": "请详细描述这张图片中的内容，包括主体、颜色、布局、风格等视觉元素。",
    "text":  "请完整提取这张图片中的所有文字，保持原文格式和排版。如果有表格，用 markdown 表格输出。",
    "代码":  "请识别图中所有的代码并输出，保持原有缩进和格式。",
}


# ============================================================
# 剪贴板图片抓取
# ============================================================

def grab_clipboard_image():
    """从 Windows 剪贴板抓取图片，保存到截图目录，返回文件路径"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    ps_code = (
        'Add-Type -AssemblyName System.Windows.Forms; '
        'try { '
        '$img = [System.Windows.Forms.Clipboard]::GetImage(); '
        'if ($img) { '
        '$filename = "clipboard_" + [System.Guid]::NewGuid().ToString("N").Substring(0,8) + ".png"; '
        '$fullpath = Join-Path "' + SCREENSHOT_DIR + '" $filename; '
        '$img.Save($fullpath, [System.Drawing.Imaging.ImageFormat]::Png); '
        'Write-Output "OK $fullpath" '
        '} else { Write-Output "NO" } '
        '} catch { Write-Output "ERR $($_.Exception.Message)" }'
    )

    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_code],
        capture_output=True, text=True, timeout=15,
    )

    output = result.stdout.strip()
    if output.startswith("OK "):
        path = output[3:].strip()
        if os.path.exists(path):
            return path
    elif output == "NO":
        return None

    err = (result.stderr or output).strip()
    raise RuntimeError(f"剪贴板读取失败: {err}")


# ============================================================
# 核心识图函数
# ============================================================

def load_image_b64(source):
    """从文件路径或 URL 加载图片，返回 base64 字符串"""
    if source.startswith(('http://', 'https://')):
        resp = requests.get(source, timeout=30)
        resp.raise_for_status()
        return base64.b64encode(resp.content).decode('utf-8'), True
    else:
        with open(source, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8'), False


def recognize_with_agnes(image_b64, prompt, model="agnes-2.0-flash"):
    """用 Agnes 免费引擎识图"""
    content = [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        {"type": "text", "text": prompt},
    ]
    resp = requests.post(
        f"{AGNES_URL}/chat/completions",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {AGNES_KEY}"},
        json={"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": 4096},
        timeout=120,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Agnes API 错误 ({resp.status_code}): {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


def recognize_with_ark(image_b64, prompt, model=ARK_VISION_MODEL):
    """用豆包/火山引擎识图（按量付费）"""
    content = [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        {"type": "text", "text": prompt},
    ]
    resp = requests.post(
        f"{ARK_URL}/chat/completions",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {ARK_KEY}"},
        json={"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": 4096},
        timeout=120,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"豆包 API 错误 ({resp.status_code}): {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


def recognize(image_source, prompt, engine="agnes"):
    """统一识图入口

    image_source: 文件路径 或 http URL
    prompt:       提示词
    engine:       "agnes"（免费，默认）| "doubao"（按量）
    返回: (识别文本, 是否来自URL)
    """
    image_b64, is_url = load_image_b64(image_source)

    if engine == "doubao":
        result = recognize_with_ark(image_b64, prompt)
    else:
        result = recognize_with_agnes(image_b64, prompt)
    return result, is_url


# ============================================================
# 交互模式
# ============================================================

def interactive_mode():
    """交互式识图"""
    print("=" * 50)
    print("  AI 识图工具（交互模式）")
    print("=" * 50)
    print("输入 q 退出\n")

    while True:
        print("\n--- 选择图片来源 ---")
        print("0. 从剪贴板抓取 ✨")
        print("1. 截图目录中的文件")
        print("2. 任意图片路径")
        print("3. 图片 URL")
        choice = input("请选择 (0/1/2/3): ").strip()

        if choice == "q":
            break

        source = None
        if choice == "0":
            print("📋 正在从剪贴板抓取图片...")
            try:
                source = grab_clipboard_image()
                if not source:
                    print("❌ 剪贴板中没有图片，请先复制/截图一张图片")
                    continue
                print(f"  已保存: {source}")
            except Exception as e:
                print(f"❌ {e}")
                continue

        elif choice == "1":
            files = list_screenshots()
            if not files:
                print("截图目录为空，请先放截图文件到:", SCREENSHOT_DIR)
                continue
            print("\n截图文件列表:")
            for i, f in enumerate(files, 1):
                size = os.path.getsize(os.path.join(SCREENSHOT_DIR, f)) // 1024
                print(f"  {i}. {f} ({size}KB)")
            idx = input("输入编号: ").strip()
            if not idx.isdigit() or int(idx) < 1 or int(idx) > len(files):
                print("❌ 无效编号")
                continue
            source = os.path.join(SCREENSHOT_DIR, files[int(idx) - 1])

        elif choice == "2":
            path = input("图片路径: ").strip()
            if not os.path.exists(path):
                print(f"❌ 文件不存在: {path}")
                continue
            source = path

        elif choice == "3":
            url = input("图片 URL: ").strip()
            if not url.startswith(('http://', 'https://')):
                print("❌ 无效 URL")
                continue
            source = url

        else:
            continue

        print("\n--- 识别模式 ---")
        print("1. 详细描述（默认）")
        print("2. 提取文字 (OCR)")
        print("3. 识别代码")
        print("4. 自定义提示词")
        mode = input("请选择 (1/2/3/4): ").strip()

        if mode == "2":
            prompt = PROMPT_TEMPLATES["text"]
        elif mode == "3":
            prompt = PROMPT_TEMPLATES["代码"]
        elif mode == "4":
            prompt = input("请输入提示词: ").strip()
        else:
            prompt = PROMPT_TEMPLATES["描述"]

        print("\n--- 选择引擎 ---")
        print("1. Agnes（免费，默认）")
        print("2. 豆包（按量付费）")
        eng_choice = input("请选择 (1/2): ").strip()
        engine = "doubao" if eng_choice == "2" else "agnes"

        print("\n🔍 正在识别，请稍候...\n")
        try:
            result, _ = recognize(source, prompt, engine)
            is_clipboard = source and "clipboard_" in os.path.basename(source)
            print("=" * 50)
            print("识别结果:")
            print("-" * 50)
            print(result)
            print("=" * 50)

            save = input("\n保存结果到 txt 文件？(y/n): ").strip().lower()
            if save == "y":
                name = os.path.basename(source) if not source.startswith("http") else "url_image"
                txt_path = os.path.join(SCREENSHOT_DIR, f"{name}_result.txt")
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(result)
                print(f"已保存: {txt_path}")

            # 剪贴板抓的临时图片用完就删
            if is_clipboard and os.path.exists(source):
                os.remove(source)

        except Exception as e:
            print(f"❌ 识别失败: {e}")
            # 出错了也删
            if source and "clipboard_" in os.path.basename(source) and os.path.exists(source):
                os.remove(source)


def list_screenshots():
    """列出截图目录中的所有图片"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    files = sorted([f for f in os.listdir(SCREENSHOT_DIR)
                    if f.lower().endswith(SUPPORTED_EXT)])
    return files


# ============================================================
# 主入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="AI 识图工具")
    parser.add_argument("image", nargs="?", help="图片文件路径或 URL（留空则查看截图目录）")
    parser.add_argument("--mode", default="描述",
                        help="识别模式：描述 / text(提取文字) / 代码 / 自定义提示词")
    parser.add_argument("--engine", default="agnes", choices=["agnes", "doubao"],
                        help="AI 引擎（默认 agnes 免费）")
    parser.add_argument("--save", action="store_true",
                        help="同时保存结果到 txt 文件")
    parser.add_argument("--clipboard", "-c", action="store_true",
                        help="从剪贴板抓取图片并识别")
    parser.add_argument("--interactive", "-i", action="store_true",
                        help="进入交互模式")
    args = parser.parse_args()

    # 交互模式
    if args.interactive:
        interactive_mode()
        return

    # 从剪贴板抓取
    if args.clipboard:
        print("📋 正在从剪贴板抓取图片...")
        try:
            image_path = grab_clipboard_image()
            if not image_path:
                print("❌ 剪贴板中没有图片。请先复制/截图一张图片。")
                sys.exit(1)
            print(f"  ✅ 已保存到: {image_path}")
        except Exception as e:
            print(f"❌ {e}")
            sys.exit(1)
    else:
        # 无参数：列出截图目录
        if not args.image:
            files = list_screenshots()
            if not files:
                print(f"📂 截图目录: {SCREENSHOT_DIR}")
                print("没有截图文件。请截图后保存到该目录，然后运行:")
                print(f"  python vision_helper.py <文件名>")
                print(f"  python vision_helper.py --clipboard    # 一键从剪贴板识别")
            else:
                print(f"📂 截图目录 ({SCREENSHOT_DIR}) 共有 {len(files)} 个文件:\n")
                for f in files:
                    path = os.path.join(SCREENSHOT_DIR, f)
                    size = os.path.getsize(path) // 1024
                    print(f"  {f} ({size}KB)")
                print("\n使用方式:")
                print(f"  python vision_helper.py <文件名> --mode text")
                print(f"  python vision_helper.py --clipboard    # 一键从剪贴板识别")
            return

        # 确定图片路径
        image_path = args.image
        if not os.path.exists(image_path):
            # 尝试从截图目录查找
            try_path = os.path.join(SCREENSHOT_DIR, args.image)
            if os.path.exists(try_path):
                image_path = try_path
            elif not args.image.startswith(('http://', 'https://')):
                print(f"❌ 找不到文件: {args.image}")
                print(f"   也不在截图目录: {SCREENSHOT_DIR}")
                sys.exit(1)

    # 确定提示词
    if args.mode in PROMPT_TEMPLATES:
        prompt = PROMPT_TEMPLATES[args.mode]
    else:
        prompt = args.mode  # 自定义提示词

    # 执行识别
    print(f"🔍 正在用【{args.engine}】引擎识别...")
    print(f"  提示词: {prompt[:60]}{'...' if len(prompt) > 60 else ''}")
    try:
        result, is_url = recognize(image_path, prompt, args.engine)
    except Exception as e:
        print(f"\n❌ 识别失败: {e}")
        # 出错了也删临时图片
        if args.clipboard and os.path.exists(image_path):
            os.remove(image_path)
        sys.exit(1)

    print("\n" + "=" * 50)
    print("识别结果:")
    print("-" * 50)
    print(result)
    print("=" * 50)

    # 剪贴板抓取的临时图片，识别完后删除
    if args.clipboard and os.path.exists(image_path):
        os.remove(image_path)

    # 可选保存
    if args.save or args.mode == "text":
        name = os.path.splitext(os.path.basename(image_path))[0]
        txt_path = os.path.join(SCREENSHOT_DIR, f"{name}_result.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(result)
        print(f"\n📄 结果已保存: {txt_path}")


if __name__ == "__main__":
    main()
