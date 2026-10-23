"""命令行入口。

用法：
    python -m annoqa ingest <路径>
    python -m annoqa ask "问题"
    python -m annoqa list
    python -m annoqa serve [--port 8000]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import load_settings
from .index import TfidfIndex
from .ingest import load_documents, split_text, Chunk
from .llm import answer_question


def _load_index(settings) -> TfidfIndex:
    return TfidfIndex.load(settings.index_path)


def cmd_ingest(args: argparse.Namespace) -> int:
    settings = load_settings()
    idx = _load_index(settings)
    source = Path(args.path)
    chunks = load_documents(source, settings.chunk_size, settings.chunk_overlap)
    if not chunks:
        print(f"没有从 {source} 解析到可用文本", file=sys.stderr)
        return 1

    incoming = {c.doc for c in chunks}
    kept = [c for c in idx.chunks if c["doc"] not in incoming]
    idx.build(kept + [c.to_dict() for c in chunks])
    idx.save(settings.index_path)

    print(f"已入库文档：{', '.join(sorted(incoming))}")
    print(f"本次新增分块：{len(chunks)}")
    print(f"当前共 {idx.doc_count} 个文档 / {idx.chunk_count} 个分块")
    return 0


def cmd_ask(args: argparse.Namespace) -> int:
    settings = load_settings()
    idx = _load_index(settings)
    if idx.chunk_count == 0:
        print("知识库为空，请先执行 ingest", file=sys.stderr)
        return 1

    hits = idx.search(args.question, top_k=args.top_k or settings.top_k)
    result = answer_question(args.question, hits, settings)

    print(f"\n问题：{result.question}")
    print(f"模式：{result.mode}")
    print("-" * 60)
    print(result.answer)
    print("-" * 60)
    if result.citations:
        print("引用来源：")
        for i, hit in enumerate(result.citations, start=1):
            print(f"  [{i}] {hit.doc} · 片段 {hit.chunk_id} · 相关度 {hit.score:.3f}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    settings = load_settings()
    idx = _load_index(settings)
    docs = idx.list_documents()
    if not docs:
        print("知识库为空")
        return 0
    print(f"{'文档':<40}分块数")
    for d in docs:
        print(f"{d['doc']:<40}{d['chunks']}")
    print(f"\n合计：{idx.doc_count} 个文档 / {idx.chunk_count} 个分块")
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run("annoqa.api:app", host=args.host, port=args.port, log_level="info")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="annoqa",
        description="AnnoQA · 标注规范问答助手",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_ingest = sub.add_parser("ingest", help="把文档入库")
    p_ingest.add_argument("path", help="文件或目录路径")
    p_ingest.set_defaults(func=cmd_ingest)

    p_ask = sub.add_parser("ask", help="提问")
    p_ask.add_argument("question", help="问题内容")
    p_ask.add_argument("--top-k", type=int, default=None, help="检索片段数")
    p_ask.set_defaults(func=cmd_ask)

    p_list = sub.add_parser("list", help="列出已入库文档")
    p_list.set_defaults(func=cmd_list)

    p_serve = sub.add_parser("serve", help="启动 Web 界面")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.set_defaults(func=cmd_serve)

    args = parser.parse_args(argv)
    return args.func(args)
