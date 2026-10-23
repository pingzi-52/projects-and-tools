"""代码修改 Agent - 用 AI 读代码、改代码、查文件
用法: python code_agent.py <任务描述> [--dir 目录]
示例: python code_agent.py "把agent.py里的TOOL_DEFINITIONS加一个发微信的工具"
      python code_agent.py "找到see.py里所有错误，修好" --dir F:/ClaudeWork/agent
"""
import io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

import json
import requests
import subprocess
import re
from pathlib import Path

# 从统一配置加载
from config import BACKENDS as _BACKENDS
API_URL = _BACKENDS["cc_switch"]["url"]
API_KEY = _BACKENDS["cc_switch"]["api_key"]
MODEL = _BACKENDS["cc_switch"]["model"]


def read_file(path):
    try:
        with open(path, "rb") as f:
            raw = f.read()
        try:
            return raw.decode("utf-8")
        except:
            return raw.decode("gbk", errors="replace")
    except:
        return None


def write_file(path, content):
    os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True


def chat(messages, max_tokens=8192):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
        "anthropic-version": "2023-06-01"
    }
    body = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    try:
        resp = requests.post(API_URL, json=body, headers=headers, timeout=300)
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]
        else:
            return f"[错误] HTTP {resp.status_code}: {resp.text[:300]}"
    except Exception as e:
        return f"[错误] {str(e)}"


def list_files(dir_path, pattern=None):
    """列出目录下的代码文件"""
    dir_path = os.path.abspath(dir_path)
    if not os.path.isdir(dir_path):
        return f"[错误] 目录不存在: {dir_path}"
    exts = {".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".md", ".txt", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".sh", ".bat", ".ps1"}
    files = []
    for root, dirs, fnames in os.walk(dir_path):
        # 跳过隐藏目录和 node_modules/.git
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules" and d != "__pycache__" and d != "venv" and d != ".venv"]
        for fn in fnames:
            ext = os.path.splitext(fn)[1].lower()
            if ext in exts:
                fp = os.path.join(root, fn)
                if pattern is None or pattern.lower() in fp.lower():
                    files.append(fp)
        if len(files) >= 50:
            break
    # 按大小排序，优先读小的
    files.sort(key=lambda x: os.path.getsize(x))
    return files


def select_files(files, max_size=50000):
    """挑出适合修改的小文件"""
    selected = []
    for f in files:
        try:
            sz = os.path.getsize(f)
            if sz < max_size:
                selected.append(f)
        except:
            pass
    return selected[:15]


def run_task(task, work_dir="."):
    task = task.strip()
    print(f"  [任务] {task}")
    print(f"  [目录] {os.path.abspath(work_dir)}")
    print()

    # 第一步：扫描目录找到相关文件
    all_files = []
    if os.path.isdir(work_dir):
        all_files = list_files(work_dir)
    print(f"  [扫描] 找到 {len(all_files)} 个代码文件")

    # 如果有明确指定的文件，直接读
    mentioned_files = re.findall(r'[\w./\\-]+\.(?:py|js|ts|jsx|tsx|html|css|json|txt|md)', task)

    # 让模型决定要看哪些文件
    file_context = "\n".join(f"  - {os.path.relpath(f, work_dir)} ({os.path.getsize(f)}B)" for f in all_files[:30])

    plan_prompt = f"""用户想修改代码，任务：
{task}

当前目录是 {os.path.abspath(work_dir)}，以下是目录下的代码文件：
{file_context if file_context else "(空目录)"}

请分析：
1. 这个任务需要修改哪些文件？写出完整路径
2. 每改一个文件前必须先读取它的全部内容
3. 你的计划是什么？先读什么，再改什么

只输出分析结果，不要输出代码。"""

    result = chat([
        {"role": "system", "content": "你是熟练的代码审核员，擅长分析代码结构并制定修改计划。输出要简洁。"},
        {"role": "user", "content": plan_prompt}
    ], max_tokens=2048)

    print(f"\n  [分析]")
    for line in result.split("\n"):
        if line.strip():
            print(f"    {line.strip()}")
    print()

    # 第二步：读取相关文件
    target_files = []
    for f in all_files:
        rel = os.path.relpath(f, work_dir)
        if rel in result or os.path.basename(f) in result:
            target_files.append(f)

    if not target_files and all_files:
        # 让模型选
        file_list = "\n".join(f"{i+1}. {os.path.relpath(f, work_dir)} ({os.path.getsize(f)}B)" for i, f in enumerate(all_files[:20]))
        pick_prompt = f"""任务是: {task}

文件列表:
{file_list}

请输出需要修改的文件编号（一行一个数字），只输出数字，不要其他内容："""
        pick_result = chat([{"role": "user", "content": pick_prompt}], max_tokens=200)
        nums = re.findall(r"\d+", pick_result)
        for n in nums[:5]:
            idx = int(n) - 1
            if 0 <= idx < len(all_files):
                target_files.append(all_files[idx])

    if not target_files:
        target_files = select_files(all_files)[:3]

    print(f"  [读取] {len(target_files)} 个文件:")

    files_content = []
    for fp in target_files:
        rel = os.path.relpath(fp, work_dir)
        content = read_file(fp)
        if content is None:
            print(f"    ✗ {rel} (读取失败)")
            continue
        print(f"    ✓ {rel} ({len(content)}字符)")
        files_content.append({"path": rel, "content": content, "full_path": fp})

    # 第三步：让模型修改
    print()
    print(f"  [修改中...] 正在生成修改方案")

    code_context = ""
    for fc in files_content:
        code_context += f"\n文件: {fc['path']}\n```\n{fc['content']}\n```\n"

    modify_prompt = f"""用户的任务是: {task}

当前已读取的代码文件如下：
{code_context}

请完成修改。对于每个需要修改的文件：
1. 输出文件名（以 "## 文件: <路径>" 开头）
2. 输出修改后的完整文件内容（用代码块 ```包裹）
3. 简短说明改了哪里

如果不需要修改代码，请说明原因。"""

    result = chat([
        {"role": "system", "content": """你是专业的代码修改专家。
修改代码的规则：
1. 只改必要的部分，不要破坏现有功能
2. 每次修改要完整输出文件内容
3. 保持代码风格一致
4. 输出格式：先写"## 文件: <路径>"，然后代码块，然后说明"""},
        {"role": "user", "content": modify_prompt}
    ], max_tokens=16384)

    # 第四步：解析并写入修改
    print()
    print(f"  [写入]")

    current_file = None
    code_block = []
    in_code = False
    writes = 0
    errors = []

    for line in result.split("\n"):
        # 匹配 "## 文件: <路径>"
        fm = re.match(r"##\s*文件[：:]*\s*(.+?)\s*$", line)
        if fm:
            # 如果上一段有代码，先保存
            if current_file and code_block:
                content = "\n".join(code_block)
                full_path = os.path.join(os.path.abspath(work_dir), current_file)
                if not os.path.exists(full_path):
                    # 尝试在当前目录下找
                    full_path = os.path.abspath(current_file)
                try:
                    write_file(full_path, content)
                    print(f"    ✓ {current_file}")
                    writes += 1
                except Exception as e:
                    print(f"    ✗ {current_file}: {e}")
                    errors.append(f"{current_file}: {e}")
            current_file = fm.group(1).strip()
            code_block = []
            in_code = False
            continue

        if line.strip().startswith("```"):
            in_code = not in_code
            if not in_code and current_file:
                pass
            continue

        if in_code and current_file:
            code_block.append(line)

    # 最后一段
    if current_file and code_block:
        content = "\n".join(code_block)
        full_path = os.path.join(os.path.abspath(work_dir), current_file)
        if not os.path.exists(full_path):
            full_path = os.path.abspath(current_file)
        try:
            write_file(full_path, content)
            print(f"    ✓ {current_file}")
            writes += 1
        except Exception as e:
            print(f"    ✗ {current_file}: {e}")
            errors.append(f"{current_file}: {e}")

    if writes == 0:
        print(f"  ⚠ 没有写入任何文件。模型回复如下:")
        print(f"\n{result}")

    print()
    print(f"  [完成] 修改了 {writes} 个文件")
    if errors:
        print(f"  [错误] {errors}")
    return writes


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("=" * 50)
        print("  代码修改 Agent")
        print("=" * 50)
        print("  用法: python code_agent.py <任务描述> [--dir 目录]")
        print()
        print("  示例:")
        print('    python code_agent.py "把agent.py加一个发短信工具"')
        print('    python code_agent.py "找到see.py的bug修好" --dir F:/ClaudeWork/agent')
        print('    python code_agent.py "给所有函数加注释" --dir F:/ClaudeWork/agent')
        sys.exit(1)

    task = sys.argv[1]
    work_dir = "."
    if "--dir" in sys.argv:
        idx = sys.argv.index("--dir")
        if idx + 1 < len(sys.argv):
            work_dir = sys.argv[idx + 1]

    run_task(task, work_dir)
