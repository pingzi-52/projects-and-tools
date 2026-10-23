"""文档解析与分块。

职责单一：把各种格式的文件变成带元数据的 chunk 列表。
不涉及向量化，不涉及检索。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from pathlib import Path

SUPPORTED_SUFFIXES = {".md", ".markdown", ".txt", ".pdf"}


@dataclass
class Chunk:
    doc: str
    chunk_id: int
    text: str

    def to_dict(self) -> dict:
        return asdict(self)


def read_document(path: Path) -> str:
    """读取单个文件为纯文本。"""
    suffix = path.suffix.lower()
    if suffix in {".md", ".markdown", ".txt"}:
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix == ".pdf":
        return _read_pdf(path)
    raise ValueError(f"不支持的文件类型：{path.suffix}（支持 {', '.join(sorted(SUPPORTED_SUFFIXES))}）")


def _read_pdf(path: Path) -> str:
    try:
        import pymupdf  # type: ignore
    except ImportError:  # pragma: no cover
        try:
            import fitz as pymupdf  # type: ignore
        except ImportError as exc:
            raise RuntimeError("解析 PDF 需要安装 pymupdf：pip install pymupdf") from exc

    parts: list[str] = []
    with pymupdf.open(str(path)) as doc:
        for page in doc:
            parts.append(page.get_text())
    return "\n".join(parts)


def clean_text(text: str) -> str:
    """归一化空白，保留段落结构。"""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[str]:
    """按字符数滑动窗口分块。

    优先在段落边界（空行）断开，找不到就往回退到句号，再退到硬切。
    这样能尽量避免把一个条款切成两半。
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size 必须为正数")
    if overlap < 0:
        raise ValueError("overlap 不能为负数")
    if overlap >= chunk_size:
        raise ValueError("overlap 必须小于 chunk_size")

    text = clean_text(text)
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            # 1) 尝试在段落边界断开
            window = text[start:end]
            cut = window.rfind("\n\n")
            if cut < chunk_size * 0.5:
                # 2) 退一步找句末标点
                best = -1
                for mark in ("。", "！", "？", "\n", ". "):
                    best = max(best, window.rfind(mark))
                cut = best if best >= chunk_size * 0.5 else -1
            if cut > 0:
                end = start + cut + 1

        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)

        if end >= n:
            break
        next_start = end - overlap
        # 防止 overlap 过小导致不前进
        start = next_start if next_start > start else end

    return chunks


def load_documents(source: Path, chunk_size: int = 400, overlap: int = 80) -> list[Chunk]:
    """加载文件或目录，返回所有分块。"""
    source = Path(source)
    if not source.exists():
        raise FileNotFoundError(f"路径不存在：{source}")

    files: list[Path] = []
    if source.is_dir():
        files = sorted(
            p for p in source.rglob("*")
            if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
        )
    else:
        if source.suffix.lower() not in SUPPORTED_SUFFIXES:
            raise ValueError(f"不支持的文件类型：{source.suffix}")
        files = [source]

    chunks: list[Chunk] = []
    for f in files:
        try:
            raw = read_document(f)
        except Exception:
            continue
        for idx, piece in enumerate(split_text(raw, chunk_size, overlap)):
            chunks.append(Chunk(doc=f.name, chunk_id=idx, text=piece))
    return chunks
