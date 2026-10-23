"""配置读取。

优先级：环境变量 > .env 文件 > 默认值。
不依赖 python-dotenv，自己解析 .env，减少依赖。
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = PROJECT_ROOT / "data"


def _load_dotenv(path: Path) -> dict[str, str]:
    """解析简单的 KEY=VALUE 格式 .env 文件。"""
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            result[key] = value
    return result


@dataclass
class Settings:
    # ---- LLM ----
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"
    llm_timeout: float = 60.0

    # ---- 分块 ----
    chunk_size: int = 400          # 目标字数
    chunk_overlap: int = 80        # 重叠字数

    # ---- 检索 ----
    top_k: int = 4

    # ---- 存储 ----
    data_dir: Path = field(default_factory=lambda: DEFAULT_DATA_DIR)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_api_key.strip())

    @property
    def index_path(self) -> Path:
        return self.data_dir / "index.json"


def load_settings(env_file: Path | None = None) -> Settings:
    env_path = env_file or (PROJECT_ROOT / ".env")
    file_values = _load_dotenv(env_path)

    def get(key: str, default: str = "") -> str:
        return os.environ.get(key) or file_values.get(key) or default

    def get_int(key: str, default: int) -> int:
        try:
            return int(get(key, str(default)))
        except ValueError:
            return default

    def get_float(key: str, default: float) -> float:
        try:
            return float(get(key, str(default)))
        except ValueError:
            return default

    data_dir_raw = get("ANNOQA_DATA_DIR")
    data_dir = Path(data_dir_raw) if data_dir_raw else DEFAULT_DATA_DIR
    if not data_dir.is_absolute():
        data_dir = PROJECT_ROOT / data_dir

    return Settings(
        llm_api_key=get("LLM_API_KEY"),
        llm_base_url=get("LLM_BASE_URL", "https://api.deepseek.com").rstrip("/"),
        llm_model=get("LLM_MODEL", "deepseek-chat"),
        llm_timeout=get_float("LLM_TIMEOUT", 60.0),
        chunk_size=get_int("CHUNK_SIZE", 400),
        chunk_overlap=get_int("CHUNK_OVERLAP", 80),
        top_k=get_int("TOP_K", 4),
        data_dir=data_dir,
    )
