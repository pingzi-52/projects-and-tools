# -*- coding: utf-8 -*-
"""浏览器工具 - 使用 Playwright CDP 直接控制 Chrome（含可视化鼠标）"""
import subprocess
import sys
import os
import json
import time
from pathlib import Path

CDP_URL = "http://localhost:9222"

# ── 单例连接池 ────────────────────────────────────────────────────────────────

_playwright = None
_browser = None
_context = None
_page = None
_connected = False


def _get_env():
    env = os.environ.copy()
    env['NO_PROXY'] = 'localhost,127.0.0.1'
    env['http_proxy'] = ''
    env['https_proxy'] = ''
    return env


def _ensure_chrome():
    """确保 Chrome 以调试模式运行"""
    import urllib.request
    try:
        req = urllib.request.Request(f'{CDP_URL}/json/version')
        proxy_handler = urllib.request.ProxyHandler({})
        opener = urllib.request.build_opener(proxy_handler)
        with opener.open(req, timeout=3) as r:
            r.read()
            return True
    except:
        pass

    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if not os.path.exists(chrome_path):
        return False

    user_data_dir = os.path.join(os.environ.get('TEMP', '/tmp'), 'chrome-debug')
    os.makedirs(user_data_dir, exist_ok=True)
    subprocess.Popen([
        chrome_path,
        f"--remote-debugging-port=9222",
        f"--user-data-dir={user_data_dir}",
    ], shell=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    for _ in range(10):
        time.sleep(1)
        try:
            req = urllib.request.Request(f'{CDP_URL}/json/version')
            proxy_handler = urllib.request.ProxyHandler({})
            opener = urllib.request.build_opener(proxy_handler)
            with opener.open(req, timeout=3) as r:
                r.read()
                return True
        except:
            pass
    return False


def _connect(force_reconnect=False):
    """连接或复用已有 CDP 连接，断开时自动重连"""
    global _playwright, _browser, _context, _page, _connected

    # 强制重连或连接失效
    if force_reconnect or not _connected:
        if _playwright:
            try:
                _playwright.stop()
            except:
                pass
            _playwright = None
            _browser = None
            _context = None
            _page = None

        if not _ensure_chrome():
            raise RuntimeError("无法启动 Chrome（调试端口 9222）")

        from playwright.sync_api import sync_playwright
        _playwright = sync_playwright().start()
        _browser = _playwright.chromium.connect_over_cdp(CDP_URL)
        contexts = _browser.contexts
        if not contexts:
            _context = _browser.new_context()
        else:
            _context = contexts[0]
        _connected = True

    # 确保有可用的 page
    if _page is None or not _page.is_closed():
        pages = _context.pages
        if pages:
            _page = pages[0]
        else:
            _page = _context.new_page()
    else:
        pages = _context.pages
        if pages:
            _page = pages[0]

    return _page


def _retry_connect(func):
    """装饰器：连接失败时自动重连后重试"""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception:
            global _connected, _page, _context, _browser, _playwright
            _connected = False
            _page = None
            _context = None
            _browser = None
            _playwright = None
            # 重连后重试
            _connect()
            return func(*args, **kwargs)
    return wrapper


def _ensure_page():
    """获取当前页，必要时自动重连"""
    try:
        return _connect()
    except Exception:
        global _connected, _page
        _connected = False
        _page = None
        return _connect()


# ── 资源释放 ──────────────────────────────────────────────────────────────────

def close():
    """释放连接资源"""
    global _playwright, _browser, _context, _page, _connected
    try:
        if _playwright:
            _playwright.stop()
    except:
        pass
    _playwright = None
    _browser = None
    _context = None
    _page = None
    _connected = False


# ── 可视化鼠标 (Visual Mouse) ───────────────────────────────────────────────

_VISUAL_MOUSE_JS = """
(function() {
    // 移除旧的
    let el = document.getElementById('__vm_cursor');
    if (el) el.remove();

    // 创建自定义光标层
    const overlay = document.createElement('div');
    overlay.id = '__vm_cursor';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 24px; height: 24px;
        pointer-events: none;
        z-index: 2147483647;
        transition: transform 0.08s ease-out;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
    `;
    overlay.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 1L4 19L8.5 14.5L14 21L17 19L11.5 12.5L19 12.5L4 1Z"
                  fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`;
    document.body.appendChild(overlay);

    // 点击动画
    window.__vm_click = function(x, y) {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed; left:${x}px; top:${y}px;
            width: 30px; height: 30px; margin:-15px 0 0 -15px;
            border-radius: 50%; background: rgba(0,150,255,0.45);
            pointer-events: none; z-index: 2147483646;
            animation: __vm_pop 0.3s ease-out forwards;
        `;
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 350);
    };

    // hover highlight
    window.__vm_hover = function(x, y) {
        let h = document.getElementById('__vm_hover');
        if (!h) {
            h = document.createElement('div');
            h.id = '__vm_hover';
            h.style.cssText = `
                position:fixed; pointer-events:none; z-index:2147483646;
                border: 2px solid rgba(0,150,255,0.7);
                border-radius: 3px; background: rgba(0,150,255,0.08);
                transition: all 0.1s;
            `;
            document.body.appendChild(h);
        }
        const el = document.elementFromPoint(x, y);
        if (!el || el === document.body) { h.style.display='none'; return; }
        const r = el.getBoundingClientRect();
        h.style.display = '';
        h.style.left = r.left + 'px';
        h.style.top  = r.top  + 'px';
        h.style.width  = r.width  + 'px';
        h.style.height = r.height + 'px';
    };

    // 平滑移动到目标坐标
    window.__vm_move = function(x, y) {
        overlay.style.transform = `translate(${x-2}px, ${y-2}px)`;
    };

    // 立即隐藏（关闭可视化）
    window.__vm_hide = function() {
        let e = document.getElementById('__vm_cursor');
        if (e) e.remove();
        let h = document.getElementById('__vm_hover');
        if (h) h.remove();
    };

    // 点击涟漪动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes __vm_pop {
            0%   { transform: scale(0.3); opacity: 1; }
            100% { transform: scale(2.5); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
})();
"""


def _show_mouse(page):
    """注入可视化鼠标"""
    page.evaluate(_VISUAL_MOUSE_JS)
    time.sleep(0.2)


def _hide_mouse(page):
    """隐藏可视化鼠标"""
    try:
        page.evaluate("window.__vm_hide && window.__vm_hide()")
    except:
        pass


def _move_mouse(page, x, y, duration=0.3):
    """平滑移动鼠标到指定坐标"""
    start = time.time()
    steps = max(int(duration * 30), 3)
    # 获取当前位置（假设从上次位置开始，首次从0,0）
    pos = getattr(_move_mouse, '_last', (0, 0))
    if pos is None:
        pos = (0, 0)
    sx, sy = pos

    for i in range(steps + 1):
        t = i / steps
        cx = int(sx + (x - sx) * t)
        cy = int(sy + (y - sy) * t)
        page.mouse.move(cx, cy)
        page.evaluate(f"window.__vm_move({cx}, {cy})")
        time.sleep(duration / steps)

    _move_mouse._last = (x, y)


def _do_click(page, selector, x=None, y=None, duration=0.4):
    """带可视化效果的点击"""
    el = page.locator(selector).first
    bbox = el.bounding_box()
    if bbox is None:
        return {'success': False, 'error': f'元素不可见: {selector}'}

    cx = int(bbox['x'] + bbox['width'] / 2)
    cy = int(bbox['y'] + bbox['height'] / 2)

    # 平滑移动到元素中心
    _move_mouse(page, cx, cy, duration=duration)

    # 显示 hover 效果
    page.evaluate(f"window.__vm_hover({cx}, {cy})")
    time.sleep(0.1)

    # 点击 + 点击动画
    page.mouse.click(cx, cy)
    page.evaluate(f"window.__vm_click({cx}, {cy})")
    time.sleep(0.35)

    # 清除 hover 高亮
    page.evaluate("window.__vm_hover(-1, -1)")

    return {'success': True, 'clicked': selector, 'x': cx, 'y': cy}


def _do_fill(page, selector, value, duration=0.4):
    """带可视化效果的填写"""
    el = page.locator(selector).first
    bbox = el.bounding_box()
    if bbox is None:
        return {'success': False, 'error': f'元素不可见: {selector}'}

    cx = int(bbox['x'] + bbox['width'] / 2)
    cy = int(bbox['y'] + bbox['height'] / 2)

    _move_mouse(page, cx, cy, duration=duration)
    page.evaluate(f"window.__vm_hover({cx}, {cy})")
    time.sleep(0.1)

    el.click()
    page.evaluate(f"window.__vm_click({cx}, {cy})")
    time.sleep(0.2)

    el.fill(value)
    time.sleep(0.3)

    page.evaluate("window.__vm_hover(-1, -1)")
    return {'success': True, 'filled': selector}


def _do_nav(page, url, wait=2):
    """导航并显示鼠标效果"""
    _move_mouse(page, 500, 50, duration=0.3)
    page.goto(url)
    page.wait_for_load_state('networkidle')
    if wait > 0:
        time.sleep(wait)
    return page


# ── 公开 API ─────────────────────────────────────────────────────────────────

def nav(url: str, wait: int = 2, visual_mouse: bool = True) -> dict:
    """导航到 URL（可选可视化鼠标）"""
    try:
        page = _ensure_page()

        if visual_mouse:
            _show_mouse(page)

        _do_nav(page, url, wait)

        return {
            'success': True,
            'url': page.url,
            'title': page.title(),
            'tabs': len(_context.pages)
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def get_text(selector: str = None) -> dict:
    """获取页面文本"""
    try:
        page = _ensure_page()

        if selector:
            text = page.inner_text(selector)
        else:
            text = page.inner_text('body')

        text = text.encode('utf-8', errors='replace').decode('utf-8')
        return {'success': True, 'text': text[:3000]}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def screenshot(path: str = None) -> dict:
    """截图"""
    try:
        page = _ensure_page()

        if not path:
            user_data_dir = os.path.join(os.environ.get('TEMP', '/tmp'), 'screenshots')
            os.makedirs(user_data_dir, exist_ok=True)
            path = os.path.join(user_data_dir, f"screenshot_{int(time.time())}.png")

        page.screenshot(path=path, full_page=True)
        return {'success': True, 'path': path}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def click(selector: str, duration: float = 0.4) -> dict:
    """带可视化效果的点击"""
    try:
        page = _ensure_page()

        if not page.locator(selector).first.count():
            return {'success': False, 'error': f'元素不存在: {selector}'}

        _show_mouse(page)
        return _do_click(page, selector, duration=duration)
    except Exception as e:
        return {'success': False, 'error': str(e)}


def fill(selector: str, value: str, duration: float = 0.4) -> dict:
    """带可视化效果的填写"""
    try:
        page = _ensure_page()

        if not page.locator(selector).first.count():
            return {'success': False, 'error': f'元素不存在: {selector}'}

        _show_mouse(page)
        return _do_fill(page, selector, value, duration=duration)
    except Exception as e:
        return {'success': False, 'error': str(e)}


def list_tabs() -> dict:
    """列出所有标签页"""
    try:
        page = _ensure_page()
        tabs = []
        for i, pg in enumerate(_context.pages):
            tabs.append({
                'index': i,
                'title': pg.title(),
                'url': pg.url[:80]
            })
        return {'success': True, 'tabs': tabs}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def get_status() -> dict:
    """检查 Chrome 状态"""
    import urllib.request
    try:
        req = urllib.request.Request(f'{CDP_URL}/json/version')
        proxy_handler = urllib.request.ProxyHandler({})
        opener = urllib.request.build_opener(proxy_handler)
        with opener.open(req, timeout=5) as r:
            data = json.loads(r.read())
            return {'success': True, 'chrome': data.get('Browser', 'unknown')}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def move_mouse(x: int, y: int, duration: float = 0.3) -> dict:
    """将鼠标平滑移动到屏幕坐标"""
    try:
        page = _ensure_page()
        _show_mouse(page)
        _move_mouse(page, x, y, duration=duration)
        return {'success': True, 'x': x, 'y': y}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def hide_mouse() -> dict:
    """隐藏可视化鼠标"""
    try:
        page = _ensure_page()
        _hide_mouse(page)
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python browser_tool.py <命令> [参数...]")
        print("命令:")
        print("  status                           检查 Chrome 状态")
        print("  nav <url> [wait秒]               导航到URL")
        print("  click <selector> [duration秒]    可视化点击")
        print("  fill <selector> <value> [duration] 可视化填写")
        print("  get_text [selector]              获取页面文本")
        print("  screenshot [path]                截图")
        print("  list_tabs                        列出标签页")
        print("  move_mouse <x> <y> [duration]    移动鼠标到坐标")
        print("  hide_mouse                       隐藏可视化鼠标")
        sys.exit(1)

    cmd = sys.argv[1]
    args = sys.argv[2:]

    if cmd == "status":
        r = get_status()
    elif cmd == "nav" and args:
        wait = int(args[1]) if len(args) > 1 and args[1].isdigit() else 2
        r = nav(args[0], wait=wait)
    elif cmd == "click" and args:
        dur = float(args[1]) if len(args) > 1 and args[1].replace('.','').isdigit() else 0.4
        r = click(args[0], duration=dur)
    elif cmd == "fill" and len(args) >= 2:
        dur = float(args[2]) if len(args) > 2 and args[2].replace('.','').isdigit() else 0.4
        r = fill(args[0], args[1], duration=dur)
    elif cmd == "get_text":
        r = get_text(args[0] if args else None)
    elif cmd == "screenshot":
        r = screenshot(args[0] if args else None)
    elif cmd == "list_tabs":
        r = list_tabs()
    elif cmd == "move_mouse" and len(args) >= 2:
        dur = float(args[2]) if len(args) > 2 else 0.3
        r = move_mouse(int(args[0]), int(args[1]), duration=dur)
    elif cmd == "hide_mouse":
        r = hide_mouse()
    else:
        r = {'success': False, 'error': '未知命令'}

    out = json.dumps(r, ensure_ascii=False, indent=2)
    sys.stdout.buffer.write(out.encode('utf-8'))
    sys.stdout.buffer.write(b'\n')
