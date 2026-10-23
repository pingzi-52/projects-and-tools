"""FastAPI 接口测试。"""
import pytest
from fastapi.testclient import TestClient

from annoqa.api import create_app
from annoqa.config import Settings


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        llm_api_key="",                    # 强制走降级模式，测试不依赖网络
        data_dir=tmp_path,
        chunk_size=150,
        chunk_overlap=30,
        top_k=3,
    )
    app = create_app(settings)
    with TestClient(app) as c:
        yield c


SAMPLE = """# 测试规范

## 贴合度

车辆包围框偏差不得超过 0.15 米。行人偏差不得超过 0.10 米。

## 抽检

每批次抽检比例为 10%，不合格率超过 5% 的整批退回。
"""


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["llm_enabled"] is False
    assert data["chunks"] == 0


def test_add_documents_from_text(client):
    res = client.post("/api/documents", json={"text": SAMPLE, "name": "test.md"})
    assert res.status_code == 200
    data = res.json()
    assert data["added_documents"] == ["test.md"]
    assert data["added_chunks"] >= 1
    assert data["total_documents"] == 1


def test_add_documents_requires_payload(client):
    res = client.post("/api/documents", json={})
    assert res.status_code == 400


def test_add_documents_invalid_path(client):
    res = client.post("/api/documents", json={"path": "Z:/definitely/not/exists"})
    assert res.status_code == 400


def test_list_documents(client):
    client.post("/api/documents", json={"text": SAMPLE, "name": "test.md"})
    res = client.get("/api/documents")
    assert res.status_code == 200
    data = res.json()
    assert any(d["doc"] == "test.md" for d in data["documents"])


def test_ask_without_documents_returns_400(client):
    res = client.post("/api/ask", json={"question": "偏差多少"})
    assert res.status_code == 400


def test_ask_returns_answer_and_citations(client):
    client.post("/api/documents", json={"text": SAMPLE, "name": "test.md"})
    res = client.post("/api/ask", json={"question": "车辆偏差多少米"})
    assert res.status_code == 200
    data = res.json()
    assert data["mode"] == "retrieval"
    assert "0.15" in data["answer"]
    assert len(data["citations"]) >= 1
    assert data["citations"][0]["doc"] == "test.md"


def test_ask_rejects_empty_question(client):
    client.post("/api/documents", json={"text": SAMPLE, "name": "test.md"})
    res = client.post("/api/ask", json={"question": ""})
    assert res.status_code == 422


def test_reingest_same_doc_does_not_duplicate(client):
    client.post("/api/documents", json={"text": SAMPLE, "name": "test.md"})
    first = client.get("/api/documents").json()["chunks"]
    client.post("/api/documents", json={"text": SAMPLE, "name": "test.md"})
    second = client.get("/api/documents").json()["chunks"]
    assert first == second


def test_clear_documents(client):
    client.post("/api/documents", json={"text": SAMPLE, "name": "test.md"})
    res = client.delete("/api/documents")
    assert res.status_code == 200
    assert client.get("/api/documents").json()["chunks"] == 0


def test_index_persists_across_app_restart(tmp_path):
    settings = Settings(llm_api_key="", data_dir=tmp_path, chunk_size=150, chunk_overlap=30)
    with TestClient(create_app(settings)) as c1:
        c1.post("/api/documents", json={"text": SAMPLE, "name": "test.md"})
        before = c1.get("/api/documents").json()["chunks"]
    with TestClient(create_app(settings)) as c2:
        after = c2.get("/api/documents").json()["chunks"]
    assert before == after > 0


def test_home_page_served(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "AnnoQA" in res.text
