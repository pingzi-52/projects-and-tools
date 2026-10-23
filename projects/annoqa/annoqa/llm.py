"""LLM 调用层 + 无 key 降级。

设计要点：
- 只用标准库 urllib 发 HTTP，不依赖 openai SDK，方便接入任何 OpenAI 兼容服务。
- 没有 API key 时不报错，返回降级文本 + 检索片段。这让项目在没有任何外部凭据时也能完整演示。
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from .config import Settings
from .index import SearchHit

SYSTEM_PROMPT = """你是一个数据标注团队的规范助手。你的回答必须严格基于提供的规范片段。

规则：
1. 只使用给出的「规范片段」中的信息回答，不要编造规范里没有的内容。
2. 如果片段中没有相关信息，直接说明「规范中没有找到相关规定」，不要猜测。
3. 回答要简洁，直接给出结论和关键数值/阈值。
4. 引用出处时用 [1] [2] 这样的编号标注对应片段。
"""


def build_context(hits: list[SearchHit]) -> str:
    """把检索结果拼成给 LLM 的上下文。"""
    if not hits:
        return "（没有检索到相关规范片段）"
    blocks = []
    for i, hit in enumerate(hits, start=1):
        blocks.append(f"[{i}] 来源：{hit.doc}（片段 {hit.chunk_id}）\n{hit.text}")
    return "\n\n".join(blocks)


def build_messages(question: str, hits: list[SearchHit]) -> list[dict]:
    """构造 OpenAI 兼容格式的 messages。"""
    context = build_context(hits)
    user_content = f"规范片段：\n{context}\n\n问题：{question}\n\n请基于以上片段回答。"
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


@dataclass
class Answer:
    question: str
    mode: str            # "llm" | "retrieval"
    answer: str
    citations: list[SearchHit]

    def to_dict(self) -> dict:
        return {
            "question": self.question,
            "mode": self.mode,
            "answer": self.answer,
            "citations": [
                {"doc": h.doc, "chunk_id": h.chunk_id, "score": round(h.score, 4), "text": h.text}
                for h in self.citations
            ],
        }


class LLMClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def chat(self, messages: list[dict]) -> str:
        """调用 OpenAI 兼容的 /chat/completions。"""
        url = f"{self.settings.llm_base_url}/chat/completions"
        payload = {
            "model": self.settings.llm_model,
            "messages": messages,
            "temperature": 0.2,
            "stream": False,
        }
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.settings.llm_api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.settings.llm_timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"LLM 接口返回 {exc.code}：{detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"无法连接 LLM 服务（{self.settings.llm_base_url}）：{exc.reason}") from exc

        try:
            return body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError) as exc:
            raise RuntimeError(f"LLM 响应格式异常：{str(body)[:300]}") from exc


def _degraded_answer(question: str, hits: list[SearchHit]) -> str:
    """无 key（或调用失败）时的降级回答：直接给出最相关片段。"""
    if not hits:
        return "没有检索到与该问题相关的规范内容。可以换个说法，或确认相关规范文档是否已入库。"
    lines = ["（当前未配置大模型 API，以下为规范原文检索结果）", ""]
    for i, hit in enumerate(hits, start=1):
        preview = hit.text if len(hit.text) <= 300 else hit.text[:300] + "…"
        lines.append(f"[{i}] 《{hit.doc}》片段 {hit.chunk_id}（相关度 {hit.score:.2f}）")
        lines.append(preview)
        lines.append("")
    return "\n".join(lines).strip()


def answer_question(question: str, hits: list[SearchHit], settings: Settings) -> Answer:
    """统一入口：有 key 走 LLM，没 key 或失败时降级为检索结果。"""
    if not settings.llm_enabled:
        return Answer(question=question, mode="retrieval",
                      answer=_degraded_answer(question, hits), citations=hits)

    try:
        client = LLMClient(settings)
        text = client.chat(build_messages(question, hits))
        return Answer(question=question, mode="llm", answer=text, citations=hits)
    except Exception as exc:  # noqa: BLE001 - 任何 LLM 失败都应降级而不是 500
        fallback = _degraded_answer(question, hits)
        return Answer(
            question=question,
            mode="retrieval",
            answer=f"（大模型调用失败，已降级为检索模式：{exc}）\n\n{fallback}",
            citations=hits,
        )
