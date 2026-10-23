"""TF-IDF 索引与检索。

零外部模型依赖：只用 numpy 实现。
选择 TF-IDF 而不是 embedding 的原因见 README「限制与未做事项」。
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import sys

# 中文按单字 + 二元组切分；英文/数字按词切分。
# 不引入 jieba 等分词依赖，保证零安装即用。
_TOKEN_RE = re.compile(r"[a-zA-Z0-9_]+|[\u4e00-\u9fff]")


def tokenize(text: str) -> list[str]:
    """简单分词：英文词 + 中文字 + 中文二元组。"""
    text = text.lower()
    raw = _TOKEN_RE.findall(text)
    tokens: list[str] = []
    # 中文连续片段同时产出单字和二元组
    cjk_buffer: list[str] = []
    for tok in raw:
        is_cjk = len(tok) == 1 and "\u4e00" <= tok <= "\u9fff"
        if is_cjk:
            cjk_buffer.append(tok)
            tokens.append(tok)
        else:
            if cjk_buffer:
                tokens.extend(_bigrams(cjk_buffer))
                cjk_buffer = []
            tokens.append(tok)
    if cjk_buffer:
        tokens.extend(_bigrams(cjk_buffer))
    return tokens


def _bigrams(chars: list[str]) -> list[str]:
    if len(chars) < 2:
        return []
    return [chars[i] + chars[i + 1] for i in range(len(chars) - 1)]


@dataclass
class SearchHit:
    doc: str
    chunk_id: int
    score: float
    text: str


class TfidfIndex:
    """内存中的 TF-IDF 索引，可持久化为 JSON。"""

    def __init__(self) -> None:
        self.chunks: list[dict] = []      # [{doc, chunk_id, text}]
        self.vocab: dict[str, int] = {}   # token -> col index
        self.idf: np.ndarray = np.zeros(0, dtype=np.float64)
        self.matrix: np.ndarray = np.zeros((0, 0), dtype=np.float64)  # 每行已 L2 归一化

    # ---------------- 构建 ----------------
    def build(self, chunks: list[dict]) -> None:
        self.chunks = [dict(c) for c in chunks]
        if not self.chunks:
            self.vocab = {}
            self.idf = np.zeros(0, dtype=np.float64)
            self.matrix = np.zeros((0, 0), dtype=np.float64)
            return

        docs_tokens = [tokenize(c["text"]) for c in self.chunks]

        # 词表
        vocab: dict[str, int] = {}
        for toks in docs_tokens:
            for t in toks:
                if t not in vocab:
                    vocab[t] = len(vocab)
        self.vocab = vocab

        n_docs = len(docs_tokens)
        df = np.zeros(len(vocab), dtype=np.float64)
        for toks in docs_tokens:
            for t in set(toks):
                df[vocab[t]] += 1.0
        # 平滑 IDF
        self.idf = np.log((1.0 + n_docs) / (1.0 + df)) + 1.0

        matrix = np.zeros((n_docs, len(vocab)), dtype=np.float64)
        for row, toks in enumerate(docs_tokens):
            if not toks:
                continue
            tf: dict[str, int] = {}
            for t in toks:
                tf[t] = tf.get(t, 0) + 1
            length = len(toks)
            for t, count in tf.items():
                col = vocab[t]
                matrix[row, col] = (count / length) * self.idf[col]
        self.matrix = _l2_normalize_rows(matrix)

    # ---------------- 查询 ----------------
    # 最低相关度阈值：低于此值的结果视为噪声丢弃。
    # 单字匹配会带来大量弱相关命中（例如「的」「是」这类高频字），
    # 加阈值避免把无关片段当成答案返回。
    MIN_SCORE = 0.12

    def search(self, query: str, top_k: int = 4, min_score: float | None = None) -> list[SearchHit]:
        if not self.chunks or self.matrix.size == 0:
            return []
        threshold = self.MIN_SCORE if min_score is None else min_score
        qvec = np.zeros(len(self.vocab), dtype=np.float64)
        toks = tokenize(query)
        if not toks:
            return []
        tf: dict[str, int] = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        known = 0
        for t, count in tf.items():
            col = self.vocab.get(t)
            if col is None:
                continue
            known += 1
            qvec[col] = (count / len(toks)) * self.idf[col]
        if known == 0:
            return []
        norm = np.linalg.norm(qvec)
        if norm == 0:
            return []
        qvec = qvec / norm

        scores = self.matrix @ qvec   # 余弦相似度（两边都已归一化）
        order = np.argsort(-scores)
        hits: list[SearchHit] = []
        for idx in order:
            score = float(scores[idx])
            if score < threshold:
                break
            c = self.chunks[int(idx)]
            hits.append(SearchHit(doc=c["doc"], chunk_id=int(c["chunk_id"]), score=score, text=c["text"]))
            if len(hits) >= top_k:
                break
        return hits

    # ---------------- 持久化 ----------------
    def save(self, path: Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "chunks": self.chunks,
            "vocab": self.vocab,
            "idf": self.idf.tolist(),
            "matrix": self.matrix.tolist(),
        }
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "TfidfIndex":
        path = Path(path)
        idx = cls()
        if not path.exists():
            return idx
        payload = json.loads(path.read_text(encoding="utf-8"))
        idx.chunks = payload.get("chunks", [])
        idx.vocab = {k: int(v) for k, v in payload.get("vocab", {}).items()}
        idx.idf = np.array(payload.get("idf", []), dtype=np.float64)
        matrix = payload.get("matrix", [])
        idx.matrix = np.array(matrix, dtype=np.float64) if matrix else np.zeros((0, 0))
        return idx

    # ---------------- 元信息 ----------------
    @property
    def doc_count(self) -> int:
        return len({c["doc"] for c in self.chunks})

    @property
    def chunk_count(self) -> int:
        return len(self.chunks)

    def list_documents(self) -> list[dict]:
        summary: dict[str, int] = {}
        for c in self.chunks:
            summary[c["doc"]] = summary.get(c["doc"], 0) + 1
        return [{"doc": d, "chunks": n} for d, n in sorted(summary.items())]


def _l2_normalize_rows(matrix: np.ndarray) -> np.ndarray:
    if matrix.size == 0:
        return matrix
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms
