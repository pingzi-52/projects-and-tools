"""检索索引测试。"""
import pytest

from annoqa.index import TfidfIndex, tokenize


SAMPLE_CHUNKS = [
    {"doc": "3d.md", "chunk_id": 0, "text": "车辆类目标包围框边缘与点云外轮廓的偏差不得超过 0.15 米。"},
    {"doc": "3d.md", "chunk_id": 1, "text": "遮挡比例超过 70% 的目标标记为 heavily_occluded，不计入有效训练样本。"},
    {"doc": "quality.md", "chunk_id": 0, "text": "每个批次完成后由质检员抽检，标准比例为 10%。"},
    {"doc": "quality.md", "chunk_id": 1, "text": "关键场景数据如行人、交通标志合格率不得低于 98%。"},
]


@pytest.fixture
def index():
    idx = TfidfIndex()
    idx.build(SAMPLE_CHUNKS)
    return idx


def test_tokenize_chinese_creates_bigrams():
    tokens = tokenize("标注规范")
    assert "标" in tokens
    assert "标注" in tokens
    assert "注规" in tokens


def test_tokenize_english_words():
    tokens = tokenize("heavily_occluded and 98")
    assert "heavily_occluded" in tokens
    assert "98" in tokens


def test_index_counts(index):
    assert index.chunk_count == 4
    assert index.doc_count == 2


def test_search_returns_relevant_chunk_first(index):
    hits = index.search("车辆包围框偏差多少米", top_k=2)
    assert hits
    assert hits[0].doc == "3d.md"
    assert hits[0].chunk_id == 0
    assert "0.15" in hits[0].text


def test_search_occlusion_query(index):
    hits = index.search("遮挡比例超过多少算无效样本", top_k=2)
    assert hits
    assert "70%" in hits[0].text


def test_search_quality_query(index):
    hits = index.search("抽检比例是多少", top_k=2)
    assert hits
    assert "10%" in hits[0].text


def test_search_scores_are_descending(index):
    hits = index.search("合格率 98%", top_k=4)
    scores = [h.score for h in hits]
    assert scores == sorted(scores, reverse=True)


def test_search_unknown_terms_returns_empty(index):
    hits = index.search("zzzqqq 完全无关的词xyz", top_k=4)
    assert hits == []


def test_search_empty_index_returns_empty():
    idx = TfidfIndex()
    idx.build([])
    assert idx.search("任意问题", top_k=3) == []


def test_top_k_limits_results(index):
    hits = index.search("标注 规范 数据 目标", top_k=2)
    assert len(hits) <= 2


def test_save_and_load_roundtrip(index, tmp_path):
    path = tmp_path / "index.json"
    index.save(path)
    reloaded = TfidfIndex.load(path)
    assert reloaded.chunk_count == index.chunk_count
    hits_a = index.search("抽检比例", top_k=2)
    hits_b = reloaded.search("抽检比例", top_k=2)
    assert [h.doc for h in hits_a] == [h.doc for h in hits_b]
    assert [h.chunk_id for h in hits_a] == [h.chunk_id for h in hits_b]


def test_load_missing_file_returns_empty_index(tmp_path):
    idx = TfidfIndex.load(tmp_path / "nope.json")
    assert idx.chunk_count == 0


def test_list_documents(index):
    docs = index.list_documents()
    names = {d["doc"] for d in docs}
    assert names == {"3d.md", "quality.md"}
    for d in docs:
        assert d["chunks"] == 2


def test_rebuild_replaces_content(index):
    index.build([{"doc": "new.md", "chunk_id": 0, "text": "全新的内容，只有抽检"}])
    assert index.chunk_count == 1
    assert index.doc_count == 1
