"""LLM 层与降级逻辑测试。"""
import pytest

from annoqa.config import Settings
from annoqa.index import SearchHit
from annoqa.llm import build_context, build_messages, answer_question


HITS = [
    SearchHit(doc="3d.md", chunk_id=0, score=0.82, text="车辆偏差不得超过 0.15 米。"),
    SearchHit(doc="quality.md", chunk_id=1, score=0.51, text="抽检比例为 10%。"),
]


def test_build_context_numbers_citations():
    ctx = build_context(HITS)
    assert "[1]" in ctx
    assert "[2]" in ctx
    assert "3d.md" in ctx
    assert "0.15" in ctx


def test_build_context_empty():
    ctx = build_context([])
    assert "没有检索到" in ctx


def test_build_messages_structure():
    messages = build_messages("偏差多少？", HITS)
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert "偏差多少？" in messages[1]["content"]
    assert "0.15" in messages[1]["content"]


def test_system_prompt_forbids_fabrication():
    messages = build_messages("test", HITS)
    system = messages[0]["content"]
    assert "不要编造" in system or "不得编造" in system or "不要猜测" in system


def test_no_key_falls_back_to_retrieval_mode():
    settings = Settings(llm_api_key="")
    result = answer_question("偏差多少？", HITS, settings)
    assert result.mode == "retrieval"
    assert result.citations == HITS
    assert "0.15" in result.answer
    assert "未配置大模型" in result.answer


def test_llm_enabled_flag():
    assert Settings(llm_api_key="sk-xxx").llm_enabled is True
    assert Settings(llm_api_key="").llm_enabled is False
    assert Settings(llm_api_key="   ").llm_enabled is False


def test_no_hits_degraded_answer():
    settings = Settings(llm_api_key="")
    result = answer_question("完全无关的问题", [], settings)
    assert result.mode == "retrieval"
    assert result.citations == []
    assert "没有检索到" in result.answer


def test_llm_failure_degrades_gracefully():
    """配置了假 key 时调用会失败，应降级而不是抛异常。"""
    settings = Settings(
        llm_api_key="sk-invalid-for-test",
        llm_base_url="http://127.0.0.1:1",   # 必然连不上
        llm_timeout=2.0,
    )
    result = answer_question("偏差多少？", HITS, settings)
    assert result.mode == "retrieval"
    assert "降级" in result.answer
    assert result.citations == HITS


def test_answer_to_dict_shape():
    settings = Settings(llm_api_key="")
    result = answer_question("偏差？", HITS, settings)
    payload = result.to_dict()
    assert set(payload) == {"question", "mode", "answer", "citations"}
    assert set(payload["citations"][0]) == {"doc", "chunk_id", "score", "text"}
    assert isinstance(payload["citations"][0]["score"], float)
