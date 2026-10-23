"""AI 工具箱 - 统一入口
python ai.py
"""
import io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

AGENT_DIR = os.path.dirname(os.path.abspath(__file__))


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


def print_banner():
    print("=" * 50)
    print("  🤖  AI 工具箱 v2.0")
    print("=" * 50)
    print(f"  当前时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  模型: Agnes 2.5 Flash / OpenRouter Nemotron Ultra 550B / cc-switch DeepSeek V4 Flash")
    print("=" * 50)


def select_option(options, prompt="请选择"):
    print()
    for i, (key, desc) in enumerate(options, 1):
        print(f"  {i}. {desc}")
    print()
    while True:
        try:
            inp = input(f"  {prompt} [1-{len(options)}]: ").strip()
            n = int(inp)
            if 1 <= n <= len(options):
                return options[n-1][0]
        except:
            pass
        print(f"  请输入 1-{len(options)}")


def run_agent():
    """通用 Agent 交互"""
    print()
    print("  ┌─────────────── AI Agent ───────────────┐")
    print("  │  支持: 搜索/翻译/识图/邮件/图表/数据库  │")
    print("  │  输入问题直接回答                        │")
    print("  │  命令: /img <路径> 识图  /help 帮助     │")
    print("  │  /cc 切cc-switch /agnes 切Agnes /or 切OpenRouter /q退出 │")
    print("  └────────────────────────────────────────┘")
    print()

    backend = "agnes"
    while True:
        try:
            inp = input(f"  [{backend}] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not inp:
            continue
        if inp == "/q":
            break
        if inp == "/cc":
            backend = "cc_switch"
            print("  → 切换至 cc-switch DeepSeek V4 Flash")
            continue
        if inp == "/agnes":
            backend = "agnes"
            print("  → 切换至 Agnes 2.0 Flash（免费）")
            continue
        if inp == "/or":
            backend = "or"
            print("  → 切换至 OpenRouter Nemotron Ultra 550B（免费）")
            continue
        if inp == "/help":
            print("  /img <路径>  识图")
            print("  /cc          切 cc-switch")
            print("  /agnes       切 Agnes")
            print("  /or          切 OpenRouter")
            print("  /q           退出")
            continue
        if inp.startswith("/img "):
            img_path = inp[5:].strip()
            py = os.path.join(AGENT_DIR, "see.py")
            subprocess.run(["python", py, img_path])
            continue

        py = os.path.join(AGENT_DIR, "agent.py")
        args = ["python", py, inp]
        if backend == "agnes":
            args.append("--agnes")
        subprocess.run(args)


def run_see():
    """识图工具"""
    print()
    print("  ┌────────── 识图工具 ──────────┐")
    print("  │  用法: 拖入图片路径或输入路径  │")
    print("  │  /q 退出                      │")
    print("  └──────────────────────────────┘")
    print()
    while True:
        try:
            inp = input("  [识图] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not inp:
            continue
        if inp == "/q":
            break
        # 去掉可能的引号
        inp = inp.strip("\"'")
        if not os.path.exists(inp):
            print(f"  文件不存在: {inp}")
            continue
        py = os.path.join(AGENT_DIR, "see.py")
        subprocess.run(["python", py, inp])


def run_code_agent():
    """代码修改 Agent"""
    print()
    print("  ┌────────── 代码修改 Agent ──────────┐")
    print("  │  输入修改任务，自动读代码改代码      │")
    print("  │  示例:                              │")
    print("  │  '给agent.py加一个发短信工具'       │")
    print("  │  '找出see.py里的bug修好'           │")
    print("  │  命令: /dir <路径> 切换工作目录     │")
    print("  │  /q 退出                            │")
    print("  └────────────────────────────────────┘")
    print()

    work_dir = AGENT_DIR
    while True:
        try:
            inp = input(f"  [代码@{os.path.basename(work_dir)}] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not inp:
            continue
        if inp == "/q":
            break
        if inp.startswith("/dir "):
            d = inp[5:].strip()
            if os.path.isdir(d):
                work_dir = d
                print(f"  工作目录: {work_dir}")
            else:
                print(f"  目录不存在: {d}")
            continue
        py = os.path.join(AGENT_DIR, "code_agent.py")
        subprocess.run(["python", py, inp, "--dir", work_dir])


def run_smolagents():
    """Smolagents - HuggingFace 极简 Agent"""
    print()
    print("  ┌──────── Smolagents Agent ────────┐")
    print("  │  HuggingFace 出品，几行代码跑Agent │")
    print("  │  说任务，AI 自动写代码完成         │")
    print("  │  /q 退出                          │")
    print("  └──────────────────────────────────┘")
    print()
    while True:
        try:
            inp = input("  [Smol] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print(); break
        if not inp or inp == "/q":
            break
        script = f"""
from smolagents import CodeAgent, HfApiModel
agent = CodeAgent(tools=[], model=HfApiModel())
agent.run(\"\"\"{inp}\"\"\")
"""
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8")
        f.write(script); f.close()
        subprocess.run(["python", f.name])
        os.unlink(f.name)


def run_tts():
    """文字转语音"""
    print()
    print("  ┌────────── 文字转语音 ──────────┐")
    print("  │  输入文字，AI 读给你听           │")
    print("  │  /q 退出                        │")
    print("  └────────────────────────────────┘")
    print()
    while True:
        try:
            inp = input("  [TTS] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print(); break
        if not inp or inp == "/q":
            break
        save_path = os.path.join(AGENT_DIR, f"tts_{int(datetime.now().timestamp())}.mp3")
        script = f"""
from gtts import gTTS
tts = gTTS(text=\"{inp}\", lang="zh-cn")
tts.save(r"{save_path}")
print(f"已保存: {{r'{save_path}'}}")
"""
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8")
        f.write(script); f.close()
        subprocess.run(["python", f.name])
        os.unlink(f.name)


def run_langflow():
    """LangFlow - 可视化拖拽搭 Agent"""
    print()
    print("  ┌──────── LangFlow 可视化 Agent ────────┐")
    print("  │  pip install langflow 后拖拽搭 Agent  │")
    print("  │  启动: langflow run                     │")
    print("  │  浏览器打开 http://localhost:7860       │")
    print("  │  /q 退出                               │")
    print("  └────────────────────────────────────────┘")
    print()
    while True:
        try:
            inp = input("  [LangFlow] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print(); break
        if not inp or inp == "/q":
            break
        subprocess.run(["langflow", "run"])


def main():
    while True:
        clear_screen()
        print_banner()

        options = [
            ("agent", "🤖  AI Agent（搜索/翻译/识图/邮件/图表/数据库 23工具）"),
            ("see",   "📷  识图工具（快速看图识别）"),
            ("code",  "🔧  代码修改 Agent（读代码改代码）"),
            ("smol",  "🧪  Smolagents（HuggingFace极简Agent）"),
            ("tts",   "🔊  文字转语音（AI读给你听）"),
            ("flow",  "🎨  LangFlow（可视化拖拽搭Agent）"),
            ("quit",  "🚪  退出"),
        ]

        choice = select_option(options)

        if choice == "quit":
            clear_screen()
            print("  再见！")
            break

        if choice == "agent":
            run_agent()
        elif choice == "see":
            run_see()
        elif choice == "code":
            run_code_agent()
        elif choice == "smol":
            run_smolagents()
        elif choice == "tts":
            run_tts()
        elif choice == "flow":
            run_langflow()

        if choice != "quit":
            input("\n  按回车返回主菜单...")


if __name__ == "__main__":
    main()
