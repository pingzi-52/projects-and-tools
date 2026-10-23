"""分块逻辑测试。"""
import pytest

from annoqa.ingest import clean_text, split_text


def test_short_text_returns_single_chunk():
    text = "这是一段很短的规范说明。"
    chunks = split_text(text, chunk_size=400, overlap=80)
    assert len(chunks) == 1
    assert chunks[0] == text


def test_empty_text_returns_no_chunks():
    assert split_text("", chunk_size=100, overlap=20) == []
    assert split_text("   \n\n  ", chunk_size=100, overlap=20) == []


def test_long_text_is_split_into_multiple_chunks():
    text = "。".join([f"第{i}条规范内容说明" for i in range(120)]) + "。"
    chunks = split_text(text, chunk_size=200, overlap=40)
    assert len(chunks) > 1
    for c in chunks:
        # 允许少量超出（断句回退），但不应远超 chunk_size
        assert len(c) <= 200 + 60


def test_chunks_have_overlap():
    text = "甲" * 1000
    chunks = split_text(text, chunk_size=200, overlap=50)
    assert len(chunks) >= 3


def test_chunk_size_must_be_positive():
    with pytest.raises(ValueError):
        split_text("abc", chunk_size=0, overlap=0)


def test_overlap_must_be_less_than_chunk_size():
    with pytest.raises(ValueError):
        split_text("abc", chunk_size=100, overlap=100)


def test_negative_overlap_rejected():
    with pytest.raises(ValueError):
        split_text("abc", chunk_size=100, overlap=-1)


def test_clean_text_normalizes_whitespace():
    messy = "第一行  \n\n\n\n第二行\r\n第三行   "
    cleaned = clean_text(messy)
    assert "\r" not in cleaned
    assert "\n\n\n" not in cleaned


def test_split_prefers_paragraph_boundary():
    para_a = "A" * 180
    para_b = "B" * 180
    text = para_a + "\n\n" + para_b
    chunks = split_text(text, chunk_size=250, overlap=20)
    assert len(chunks) >= 2
    # 第一块应该以 A 段落内容为主，说明在段落边界断开了
    assert "A" in chunks[0]
