"""FastAPI 应用：把索引和问答能力暴露为 HTTP 接口。"""
from __future__ import annotations

from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import Settings, load_settings
from .index import TfidfIndex
from .ingest import Chunk, load_documents, split_text
from .llm import answer_question

STATIC_DIR = Path(__file__).parent / "static"


class IngestRequest(BaseModel):
    path: str | None = Field(default=None, description="服务器上的文件或目录路径")
    text: str | None = Field(default=None, description="直接提交的文本内容")
    name: str = Field(default="manual.md", description="文本内容对应的文档名")


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    top_k: int | None = Field(default=None, ge=1, le=20)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    index = TfidfIndex.load(settings.index_path)
    lock = Lock()

    app = FastAPI(
        title="AnnoQA · 标注规范问答助手",
        description="基于 RAG 的标注规范检索问答工具",
        version="0.1.0",
    )

    def _persist() -> None:
        index.save(settings.index_path)

    @app.get("/api/health")
    def health() -> dict:
        return {
            "status": "ok",
            "llm_enabled": settings.llm_enabled,
            "llm_model": settings.llm_model if settings.llm_enabled else None,
            "documents": index.doc_count,
            "chunks": index.chunk_count,
        }

    @app.get("/api/documents")
    def list_documents() -> dict:
        return {"documents": index.list_documents(), "chunks": index.chunk_count}

    @app.post("/api/documents")
    def add_documents(req: IngestRequest) -> dict:
        new_chunks: list[Chunk] = []
        with lock:
            if req.text is not None:
                name = req.name or "manual.md"
                for idx, piece in enumerate(split_text(req.text, settings.chunk_size, settings.chunk_overlap)):
                    new_chunks.append(Chunk(doc=name, chunk_id=idx, text=piece))
            elif req.path is not None:
                try:
                    new_chunks = load_documents(Path(req.path), settings.chunk_size, settings.chunk_overlap)
                except (FileNotFoundError, ValueError) as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
            else:
                raise HTTPException(status_code=400, detail="必须提供 path 或 text 之一")

            if not new_chunks:
                raise HTTPException(status_code=400, detail="没有解析到任何可用文本")

            incoming_docs = {c.doc for c in new_chunks}
            # 同名文档重新入库时先移除旧分块，避免重复
            kept = [c for c in index.chunks if c["doc"] not in incoming_docs]
            merged = kept + [c.to_dict() for c in new_chunks]
            index.build(merged)
            _persist()

        return {
            "added_documents": sorted(incoming_docs),
            "added_chunks": len(new_chunks),
            "total_documents": index.doc_count,
            "total_chunks": index.chunk_count,
        }

    @app.delete("/api/documents")
    def clear_documents() -> dict:
        with lock:
            index.build([])
            if settings.index_path.exists():
                settings.index_path.unlink()
        return {"status": "cleared"}

    @app.post("/api/ask")
    def ask(req: AskRequest) -> dict:
        question = req.question.strip()
        if not question:
            raise HTTPException(status_code=400, detail="问题不能为空")
        if index.chunk_count == 0:
            raise HTTPException(status_code=400, detail="知识库为空，请先入库文档")
        top_k = req.top_k or settings.top_k
        hits = index.search(question, top_k=top_k)
        result = answer_question(question, hits, settings)
        return result.to_dict()

    # ---- 静态页面 ----
    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

        @app.get("/")
        def home() -> FileResponse:
            return FileResponse(STATIC_DIR / "index.html")

    return app


# uvicorn annoqa.api:app --reload
app = create_app()
