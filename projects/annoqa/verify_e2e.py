"""真实端到端验证脚本：启动 FastAPI 服务，通过 HTTP 接口完成入库与问答。

用于生成 README 里的「已验证运行结果」，不依赖 LLM key（走检索降级模式）。
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8011"


def wait_for_server(client: httpx.Client, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = client.get(f"{BASE}/api/health", timeout=1.0)
            if r.status_code == 200:
                return True
        except Exception:
            time.sleep(0.3)
    return False


def main() -> int:
    print("=" * 70)
    print("AnnoQA 真实 HTTP 端到端验证")
    print("=" * 70)

    with httpx.Client(timeout=30.0) as client:
        if not wait_for_server(client):
            print("FAIL: 服务未能在 30 秒内启动")
            return 1

        # ---- 1. 健康检查 ----
        health = client.get(f"{BASE}/api/health").json()
        print("\n[1] GET /api/health")
        print(json.dumps(health, ensure_ascii=False, indent=2))

        # ---- 2. 清空 + 入库 ----
        client.delete(f"{BASE}/api/documents")
        docs_dir = Path(__file__).resolve().parent / "docs"
        r = client.post(f"{BASE}/api/documents", json={"path": str(docs_dir)})
        ingest = r.json()
        print(f"\n[2] POST /api/documents  (path={docs_dir.name}/)")
        print(json.dumps(ingest, ensure_ascii=False, indent=2))

        # ---- 3. 文档列表 ----
        listing = client.get(f"{BASE}/api/documents").json()
        print("\n[3] GET /api/documents")
        print(json.dumps(listing, ensure_ascii=False, indent=2))

        # ---- 4. 真实问答 ----
        questions = [
            "3D 点云标注框的贴合误差怎么控制？",
            "遮挡超过多少算无效样本？",
            "抽检比例是多少？",
            "遇到规范没写的情况怎么处理？",
        ]
        print("\n[4] POST /api/ask  ×4")
        all_ok = True
        for q in questions:
            r = client.post(f"{BASE}/api/ask", json={"question": q})
            if r.status_code != 200:
                print(f"  FAIL {r.status_code}: {q}")
                all_ok = False
                continue
            data = r.json()
            top = data["citations"][0] if data["citations"] else None
            print(f"\n  问题：{q}")
            print(f"  模式：{data['mode']}    引用数：{len(data['citations'])}")
            if top:
                print(f"  最佳命中：{top['doc']} 片段 {top['chunk_id']}  相关度 {top['score']}")
                first_line = top["text"].split("\n")[0][:60]
                print(f"  片段开头：{first_line}")

        # ---- 5. 边界用例 ----
        print("\n[5] 边界用例")
        r_empty = client.post(f"{BASE}/api/ask", json={"question": "完全无关的问题zzzqqq"})
        print(f"  无关问题 -> HTTP {r_empty.status_code}, citations={len(r_empty.json().get('citations', []))}")

        r_bad = client.post(f"{BASE}/api/ask", json={"question": ""})
        print(f"  空问题   -> HTTP {r_bad.status_code}（预期 422）")

        r_page = client.get(f"{BASE}/")
        has_ui = "AnnoQA" in r_page.text
        print(f"  GET /    -> HTTP {r_page.status_code}, 包含界面: {has_ui}")

        print("\n" + "=" * 70)
        print("RESULT:", "ALL OK" if all_ok and has_ui else "HAS FAILURES")
        print("=" * 70)
        return 0 if (all_ok and has_ui) else 1


if __name__ == "__main__":
    sys.exit(main())
