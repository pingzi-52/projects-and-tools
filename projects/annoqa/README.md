# AnnoQA — 标注规范问答助手

基于 RAG（Retrieval-Augmented Generation）的标注规范检索问答工具。

把团队的标注规范文档丢进去，用自然语言提问，工具从规范里找出相关条款并给出答案 + 出处。

**没有大模型 API key 也能用** —— 自动降级为纯检索模式，直接返回最相关的规范片段。

---

## 为什么做这个

数据标注团队的规范文档通常是几十页的 MD / PDF，新人和日常工作中要反复翻找具体条款：

- 「3D 点云标注框贴合度允许多少误差？」
- 「这些样本算不算遮挡？」
- 「遇到规范里没写的情况该怎么处理？」

问老员工要占用时间，自己翻文档又慢。这个工具把规范变成可检索的知识库。

---

## 架构

```
                    ┌──────────────────────────────┐
   文档 (.md/.txt/.pdf) │        ingest.py             │
                    │  解析 → 清洗 → 分块(带重叠)    │
                    └───────────────┬──────────────┘
                                    │ chunks
                    ┌───────────────▼──────────────┐
                    │         index.py              │
                    │  TF-IDF 向量化 + 余弦相似度     │
                    │  持久化到 data/index.json     │
                    └───────────────┬──────────────┘
                                    │ top-k chunks
   提问 ─────────────►┌──────────────────────────────┐
                    │          llm.py               │
                    │  prompt 构造 → LLM 回答        │
                    │  (无 key 时降级为纯检索)        │
                    └───────────────┬──────────────┘
                                    │ answer + citations
                    ┌───────────────▼──────────────┐
                    │    api.py (FastAPI) / cli.py  │
                    │  POST /api/ask  ·  Web 界面    │
                    └──────────────────────────────┘
```

**分层原则**：切分、检索、LLM 调用、API 四层各自独立，都可以脱离其他层单独测试。检索层零外部模型依赖（纯 numpy 实现的 TF-IDF），不需要下载 embedding 模型就能跑。

---

## 快速开始

```bash
cd rag-assistant
pip install -r requirements.txt

# 1. 把示例文档入库
python -m annoqa ingest docs/

# 2. 提问（命令行）
python -m annoqa ask "3D 点云标注框的贴合误差怎么控制？"

# 3. 启动 Web 界面
python -m annoqa serve
# 打开 http://127.0.0.1:8000
```

---

## 配置

复制 `.env.example` 为 `.env`，填入任意 OpenAI 兼容服务的配置：

```ini
# 留空则自动降级为「仅检索模式」
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

常见配置：

| 服务 | LLM_BASE_URL | LLM_MODEL |
|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Ollama（本地） | `http://localhost:11434/v1` | `qwen2.5:7b` |

只要服务兼容 OpenAI 的 `/chat/completions` 协议就能接。

---

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/documents` | 上传并索引文档，body: `{"path": "docs/"}` 或 `{"text": "...", "name": "..."}` |
| `GET` | `/api/documents` | 列出已入库文档及分块数 |
| `POST` | `/api/ask` | 提问，body: `{"question": "...", "top_k": 4}` |
| `DELETE` | `/api/documents` | 清空索引 |
| `GET` | `/api/health` | 健康检查（含当前是否启用 LLM） |

`/api/ask` 返回：

```json
{
  "question": "3D 点云标注框的贴合误差怎么控制？",
  "mode": "retrieval",          // retrieval | llm
  "answer": "...",
  "citations": [
    {"doc": "3d-pointcloud.md", "chunk_id": 3, "score": 0.62, "text": "..."},
    ...
  ]
}
```

---

## 测试

```bash
pytest -v
```

测试覆盖：文档分块（大小/重叠/边界）、TF-IDF 索引与相似度排序、prompt 构造、无 key 降级逻辑、API 参数校验。

---

## 已验证的运行结果

> 以下为本机实际执行记录，非预估。执行环境：Python 3.12.14 / FastAPI 0.156.4 / pytest 9.1.1，
> **未配置任何 LLM API key**，因此全部验证走「无 key 自动降级为检索模式」路径。

### 1. pytest（44 项全部通过）

```
$ pytest tests/ -q
............................................                             [100%]
44 passed, 1 warning in 4.19s
```

测试分布：`test_ingest.py` 9 项（分块/重叠/边界/参数校验）、`test_index.py` 14 项（分词/索引/排序/持久化）、`test_llm.py` 9 项（prompt 构造/降级逻辑/失败兜底）、`test_api.py` 12 项（接口/重复入库/持久化/前端页面）。

> 开发过程中曾有 1 项测试失败：查询「完全无关的词xyz」时，因中文单字被切分后碰巧命中语料，返回了低分噪声结果。修复方式是给检索加最低相关度阈值 `MIN_SCORE = 0.12`。

### 2. 命令行入库

```
$ python -m annoqa ingest docs/
已入库文档：3d-pointcloud.md, image-text.md, quality-standard.md
本次新增分块：8
当前共 3 个文档 / 8 个分块
```

### 3. HTTP 端到端（verify_e2e.py）

启动 `uvicorn annoqa.api:app --port 8011` 后通过真实 HTTP 请求验证：

```
[1] GET /api/health
{"status":"ok","llm_enabled":false,"llm_model":null,"documents":0,"chunks":0}

[2] POST /api/documents  (path=docs/)
{"added_documents":["3d-pointcloud.md","image-text.md","quality-standard.md"],
 "added_chunks":8,"total_documents":3,"total_chunks":8}

[4] POST /api/ask ×4
  问题：3D 点云标注框的贴合误差怎么控制？
  模式：retrieval  引用数：3
  最佳命中：3d-pointcloud.md 片段 0  相关度 0.3402

  问题：遮挡超过多少算无效样本？
  模式：retrieval  引用数：1
  最佳命中：3d-pointcloud.md 片段 1  相关度 0.2412

  问题：抽检比例是多少？
  模式：retrieval  引用数：2
  最佳命中：quality-standard.md 片段 0  相关度 0.2791

  问题：遇到规范没写的情况怎么处理？
  模式：retrieval  引用数：2
  最佳命中：image-text.md 片段 2  相关度 0.2287

[5] 边界用例
  无关问题 -> HTTP 200, citations=0        （阈值过滤生效）
  空问题   -> HTTP 422                      （参数校验生效）
  GET /    -> HTTP 200, 包含界面: True      （前端页面正常返回）

RESULT: ALL OK
```

### 4. 尚未验证的部分（如实说明）

- **接入真实大模型后的端到端问答未验证**：本机环境没有任何 LLM API key（`DEEPSEEK_API_KEY` / `OPENAI_API_KEY` 均未设置），所以「prompt → LLM → 自然语言答案」这条链路只验证了代码路径与失败降级，没有验证过真实模型的回答质量。
- 未做检索效果的量化评估（无标注测试集，未计算 recall@k / MRR）。
- 未做并发压力测试。

---

## 限制与未做事项

如实记录当前版本的边界：

- **检索质量**：TF-IDF 是词面匹配，不理解语义。问「遮挡怎么处理」和文档写「occlusion 处理」时匹配不到。生产环境应换用 embedding 模型（如 bge-small-zh / text-embedding-3-small）或混合检索（BM25 + 向量）。
- **分块策略**：固定字符数滑动窗口，没有按标题/段落结构切分，可能把一个条款切成两半。对规范类文档来说，按 `##` 标题切分效果会更好。
- **没有重排序（rerank）**：top-k 直接交给 LLM，没有用 cross-encoder 重排，召回精度有上限。
- **没有多轮对话**：每次提问独立，不支持追问上下文。
- **索引是内存 + JSON 文件**：文档量大于几千块时应换 FAISS / Chroma 等向量库。
- **没有权限控制**：文档不分用户，任何人可检索全部内容。

这些不是为了自谦，而是清楚知道下一步该做什么。

---

## 目录结构

```
rag-assistant/
├── annoqa/
│   ├── __init__.py
│   ├── __main__.py      # python -m annoqa 入口
│   ├── config.py        # .env 读取与配置
│   ├── ingest.py        # 文档解析 + 分块
│   ├── index.py         # TF-IDF 向量化 + 检索 + 持久化
│   ├── llm.py           # LLM 调用 + 无 key 降级
│   ├── api.py           # FastAPI 路由
│   ├── cli.py           # 命令行
│   └── static/
│       └── index.html   # 聊天式 Web 界面
├── docs/                # 示例标注规范文档
├── tests/               # pytest
├── requirements.txt
├── .env.example
└── README.md
```
