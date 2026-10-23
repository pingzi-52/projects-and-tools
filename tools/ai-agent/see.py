"""
识图工具 - 支持 剪贴板读取 / 文件路径 / 多后端自动切换

用法:
  python see.py <图片路径> [提示词] [--agnes|--kimi|--zhipu]
  python see.py                        # 自动从剪贴板读取

后端:
  --agnes  Agnes 2.5 Flash（免费，默认，推荐全景图）
  --kimi   Kimi K2.6（¥15，适合大量文字识别）
  --zhipu  智谱 GLM-4V-Flash（免费，备用）
"""
import io, sys, os, time, json, base64
import requests
from pathlib import Path

# 强制 UTF-8 输出
if sys.stdout.encoding != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from config import BACKENDS as _CFG


# ----- 自动代理检测 -----
_proxy = None
try:
    r = requests.get('http://127.0.0.1:7892', timeout=2)
    if r.status_code in (200, 400, 404, 502):
        _proxy = {'http': 'http://127.0.0.1:7892', 'https': 'http://127.0.0.1:7892'}
except:
    pass


def grab_clipboard(save_path):
    """从 Windows 剪贴板读取图片并保存"""
    import ctypes
    user32 = ctypes.windll.user32
    ole32 = ctypes.windll.ole32
    kernel32 = ctypes.windll.kernel32

    ole32.OleInitialize(None)
    user32.OpenClipboard(None)
    handle = user32.GetClipboardData(17)  # CF_DIBV5
    if not handle:
        handle2 = user32.GetClipboardData(8)  # CF_DIB
        if not handle2:
            user32.CloseClipboard()
            ole32.OleUninitialize()
            return None
        handle = handle2

    size = kernel32.GlobalSize(handle)
    ptr = kernel32.GlobalLock(handle)
    buf = ctypes.create_string_buffer(size)
    ctypes.windll.kernel32.RtlMoveMemory(buf, ptr, size)
    kernel32.GlobalUnlock(handle)
    user32.CloseClipboard()
    ole32.OleUninitialize()

    with open(save_path, "wb") as f:
        f.write(buf.raw)
    # DIB → PNG
    from PIL import Image
    img = Image.open(save_path)
    png_path = save_path.replace(".dib", ".png")
    img.save(png_path)
    if os.path.exists(save_path):
        os.remove(save_path)  # 删掉中间文件
    return png_path


BACKENDS = {}
for _name, _cfg in _CFG.items():
    if _name in ("agnes", "kimi", "zhipu", "silicon"):
        BACKENDS[_name] = {
            "url": _cfg["url"],
            "key": _cfg["api_key"],
            "model": _cfg["model"],
        }

# 后端优先级顺序（自动 fallback 用）
BACKEND_ORDER = ["agnes", "zhipu", "kimi", "silicon"]
BACKEND_LABELS = {
    "agnes": "Agnes 2.0 Flash（免费）",
    "zhipu": "智谱 GLM-4-Flash（免费）",
    "kimi": "Kimi K2.6（¥15 付费）",
    "silicon": "硅基 Qwen2.5-7B（免费）",
}


def identify(image_path, prompt="", backend="agnes", retries=2):
    cfg = BACKENDS.get(backend)
    if not cfg:
        print(f"错误: 未知后端 '{backend}'，可选: {', '.join(BACKENDS.keys())}")
        return False

    path = Path(image_path)
    if not path.exists():
        print(f"文件不存在: {image_path}")
        return False

    raw = path.read_bytes()
    size_mb = len(raw) / 1024 / 1024

    # 超过 1MB 缩图
    if len(raw) > 1024 * 1024:
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(raw))
            w, h = img.size
            # 长边不超过 1280
            if max(w, h) > 1280:
                scale = 1280 / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            raw = buf.getvalue()
            print(f"  📏 原图较大，已缩至 {img.size[0]}x{img.size[1]}")
        except:
            pass

    ext = path.suffix.lower()
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".webp": "image/webp"}
    mime_type = mime.get(ext, "image/png")
    b64 = base64.b64encode(raw).decode()

    final_prompt = prompt or "请用中文详细描述这张图片，提取图中所有文字内容"

    model_name = cfg["model"]
    print(f"  🔄 正在识别（{model_name}）...", end="", flush=True)

    for attempt in range(retries + 1):
        try:
            proxies = _proxy if _proxy else None
            resp = requests.post(cfg["url"], headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {cfg['key']}"
            }, json={
                "model": cfg["model"],
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": final_prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}}
                ]}],
                "max_tokens": 4096,
            }, timeout=120)

            if resp.status_code == 200:
                data = resp.json()
                reply = data["choices"][0]["message"]["content"]
                print("\r  ✅ 识别完成\n")
                print(reply)
                return True
            else:
                err = resp.text[:300]
                if attempt < retries:
                    print(f"\r  ⚠️ 出错({resp.status_code})，重试({attempt+1}/{retries})...", flush=True)
                    time.sleep(1)
                else:
                    print(f"\r  ❌ 失败: {err}")

        except requests.exceptions.Timeout:
            if attempt < retries:
                print(f"\r  ⏱ 超时，重试({attempt+1}/{retries})...", flush=True)
            else:
                print(f"\r  ❌ 超时，已重试{retries}次仍失败")

        except Exception as e:
            print(f"\r  ❌ 错误: {e}")
            return False

    return False


def identify_with_fallback(image_path, prompt="", prefer=None):
    """按优先级尝试多个后端"""
    if prefer and prefer in BACKEND_ORDER:
        order = [prefer] + [b for b in BACKEND_ORDER if b != prefer]
    else:
        order = BACKEND_ORDER

    for backend in order:
        result = identify(image_path, prompt, backend)
        if result:
            return True
        # 失败了自动换下一个
        next_backends = [b for b in order if b != backend]
        if next_backends:
            print(f"  ⬇️ 自动切换下一后端...")
    return False


if __name__ == "__main__":
    img = None
    prompt = ""
    backend = None  # None = 自动选

    # 解析参数
    # 规则：如果有参数且不以 -- 开头、且看起来像文件路径（含扩展名或路径分隔符），当作图片
    first_arg = sys.argv[1] if len(sys.argv) >= 2 and not sys.argv[1].startswith("--") else None
    if first_arg and (os.path.exists(first_arg) or "." in first_arg or "/" in first_arg or "\\" in first_arg):
        img = first_arg
        args = sys.argv[2:]
    else:
        img = None
        args = sys.argv[1:] if not first_arg else [first_arg] + sys.argv[2:]

    for a in args:
        if a == "--agnes": backend = "agnes"
        elif a == "--kimi": backend = "kimi"
        elif a == "--zhipu": backend = "zhipu"
        elif a == "--silicon": backend = "silicon"
        elif not a.startswith("--"):
            prompt = a

    # 1. 如果没给路径，尝试从剪贴板读取
    grabbed = False
    if not img:
        print("  📋 未指定图片路径，尝试从剪贴板读取...")
        saved = grab_clipboard("F:\\ClaudeWork\\agent\\see_clip.dib")
        if saved:
            img = saved
            grabbed = True
            print(f"  ✅ 剪贴板图片已保存: {img}")
        else:
            print("❌ 剪贴板中没有图片，请先截图或提供图片路径")
            print("用法: python see.py <图片路径> [提示词] [--agnes|--kimi|--zhipu]")
            sys.exit(1)

    # 2. 检查文件
    if not os.path.exists(img):
        print(f"❌ 文件不存在: {img}")
        sys.exit(1)

    img_size = os.path.getsize(img)
    print(f"\n📷 图片: {img} ({img_size/1024:.0f}KB)")

    # 3. 识别
    success = False
    if backend:
        label = BACKEND_LABELS.get(backend, backend)
        print(f"🎯 后端: {label}\n")
        success = identify(img, prompt, backend)
    else:
        for be in BACKEND_ORDER:
            label = BACKEND_LABELS.get(be, be)
            print(f"🎯 尝试: {label}")
            if identify(img, prompt, be):
                success = True
                break
            remaining = [b for b in BACKEND_ORDER if BACKEND_ORDER.index(b) > BACKEND_ORDER.index(be)]
            if remaining:
                print(f"  ⬇️ 切换下一个后端...\n")
        else:
            print("\n❌ 所有后端均失败")

    # 4. 自动清理临时文件（剪贴板读取的才删，用户指定的不删）
    if grabbed and os.path.exists(img):
        os.remove(img)
        # print(f"  🗑️ 临时文件已删除")
