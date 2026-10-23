"""
豆包 AI 完整接入模块 (ByteDance Doubao / Ark Platform)
功能: 文本对话 | 流式输出 | 图片生成 | 图片理解 | 深度思考 | 视频生成

============================================================
使用说明:
  pip install requests
============================================================
"""
import base64
import json
import sys
import io
import os
import time
from datetime import datetime
from typing import Optional

import requests

# 修复 Windows 终端 GBK 编码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ============================================================
# 配置 - 豆包 / 火山引擎（按量付费）
# ============================================================
ARK_API_KEY = os.getenv("ARK_API_KEY", "")
BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

# ============================================================
# 配置 - Agnes AI（全部免费）
# ============================================================
AGNES_API_KEY = os.getenv("AGNES_API_KEY", "")
AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1"

# ============================================================
# 模型 ID 常量
# ============================================================
class Models:
    """豆包/火山引擎 - 按量付费"""
    SEED_2_0_PRO   = "doubao-seed-2-0-pro-251228"
    SEED_2_0_LITE  = "doubao-seed-2-0-lite-251228"
    SEED_2_0_MINI  = "doubao-seed-2-0-mini-251228"
    SEED_1_8       = "doubao-seed-1-8-251228"
    SEED_1_6       = "doubao-seed-1-6-250615"
    PRO_32K        = "doubao-pro-32k"
    VISION_LITE    = "doubao-1.5-vision-lite-250315"
    VISION_PRO_32K = "doubao-1.5-vision-pro-32k"
    THINKING_PRO   = "doubao-1.5-thinking-pro"
    SEEDREAM_5_0   = "doubao-seedream-5-0-260128"
    SEEDREAM_4_5   = "doubao-seedream-4-5-251128"
    SEEDREAM_4_0   = "doubao-seedream-4-0-250828"
    DEEPSEEK_V3_2  = "deepseek-v3-2-251201"
    DEEPSEEK_R1    = "deepseek-r1-250528"
    KIMI_K2_5      = "kimi-k2-5-260127"
    GLM_4_7        = "glm-4-7-251222"


class AgnesModels:
    """Agnes AI - 全部免费"""
    CHAT   = "agnes-2.0-flash"           # 对话 + 识图
    IMAGE  = "agnes-image-2.1-flash"     # 文生图 4K
    IMAGE2 = "agnes-image-2.0-flash"     # 图生图、图编辑
    VIDEO  = "agnes-video-v2.0"          # 文/图生视频


# ============================================================
# DoubaoClient - 豆包/火山引擎（按量付费）
# ============================================================
class DoubaoClient:
    def __init__(self, api_key: str = ARK_API_KEY, base_url: str = BASE_URL):
        self.api_key = api_key
        self.base_url = base_url

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def chat(self, prompt: str, system: Optional[str] = None,
             model: str = Models.SEED_2_0_PRO,
             temperature: float = 0.7, max_tokens: int = 4096) -> str:
        """非流式文本对话"""
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json={"model": model, "messages": messages,
                  "temperature": temperature, "max_tokens": max_tokens},
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Chat Error ({resp.status_code}): {resp.text[:500]}")
        return resp.json()["choices"][0]["message"]["content"]

    def vision(self, prompt: str, image_path: Optional[str] = None,
               model: str = Models.VISION_LITE) -> str:
        """图片理解"""
        content = []
        if image_path:
            with open(image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            content.append({"type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64}"}})
        content.append({"type": "text", "text": prompt})
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json={"model": model, "messages": [{"role": "user", "content": content}],
                  "max_tokens": 4096},
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Vision Error ({resp.status_code}): {resp.text[:500]}")
        return resp.json()["choices"][0]["message"]["content"]

    def generate_image(self, prompt: str, model: str = Models.SEEDREAM_5_0,
                       size: str = "2K", output_format: str = "png",
                       watermark: bool = False,
                       output_path: Optional[str] = None) -> str:
        """文生图"""
        resp = requests.post(
            f"{self.base_url}/images/generations",
            headers=self._headers(),
            json={"model": model, "prompt": prompt, "size": size,
                  "output_format": output_format, "response_format": "b64_json",
                  "watermark": watermark},
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Image Error ({resp.status_code}): {resp.text[:500]}")
        data = resp.json()["data"][0]
        img_bytes = base64.b64decode(data["b64_json"])
        if not output_path:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = f"seedream_{ts}.png"
        with open(output_path, "wb") as f:
            f.write(img_bytes)
        return output_path

    def think(self, prompt: str, model: str = Models.THINKING_PRO,
              max_tokens: int = 8192) -> dict:
        """深度思考模式"""
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json={"model": model, "messages": [{"role": "user", "content": prompt}],
                  "max_tokens": max_tokens,
                  "extra_body": {"thinking": {"type": "enabled"}}},
            timeout=300,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Thinking Error ({resp.status_code}): {resp.text[:500]}")
        choice = resp.json()["choices"][0]
        msg = choice["message"]
        return {"thinking": msg.get("reasoning_content", ""),
                "answer": msg.get("content", "")}


# ============================================================
# AgnesClient - 全部免费
# ============================================================
class AgnesClient:
    def __init__(self, api_key: str = AGNES_API_KEY, base_url: str = AGNES_BASE_URL):
        self.api_key = api_key
        self.base_url = base_url

    def _headers(self) -> dict:
        return {"Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"}

    def chat(self, prompt: str, system: Optional[str] = None,
             max_tokens: int = 4096) -> str:
        """文本对话"""
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json={"model": AgnesModels.CHAT, "messages": messages,
                  "max_tokens": max_tokens},
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Agnes Chat Error ({resp.status_code}): {resp.text[:500]}")
        return resp.json()["choices"][0]["message"]["content"]

    def vision(self, prompt: str, image_path: Optional[str] = None,
               image_url: Optional[str] = None) -> str:
        """图片理解"""
        content = []
        if image_url:
            content.append({"type": "image_url", "image_url": {"url": image_url}})
        elif image_path:
            with open(image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            content.append({"type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64}"}})
        content.append({"type": "text", "text": prompt})
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json={"model": AgnesModels.CHAT,
                  "messages": [{"role": "user", "content": content}],
                  "max_tokens": 4096},
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Agnes Vision Error ({resp.status_code}): {resp.text[:500]}")
        return resp.json()["choices"][0]["message"]["content"]

    def generate_image(self, prompt: str,
                       model: str = AgnesModels.IMAGE,
                       size: str = "1024x1024",
                       output_path: Optional[str] = None) -> str:
        """文生图"""
        resp = requests.post(
            f"{self.base_url}/images/generations",
            headers=self._headers(),
            json={"model": model, "prompt": prompt, "size": size,
                  "response_format": "b64_json"},
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Agnes Image Error ({resp.status_code}): {resp.text[:500]}")
        data = resp.json()["data"][0]
        img_bytes = base64.b64decode(data["b64_json"])
        if not output_path:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = f"agnes_img_{ts}.png"
        with open(output_path, "wb") as f:
            f.write(img_bytes)
        return output_path

    def generate_video(self, prompt: str,
                       image_path: Optional[str] = None,
                       output_path: Optional[str] = None,
                       max_wait: int = 600, interval: int = 10,
                       num_frames: int = 121, frame_rate: int = 24) -> str:
        """文/图生视频（异步轮询）

        提交任务 → 获得 video_id → 轮询等待 → 下载mp4
        视频默认保存到 F:/ClaudeWork/Video/
        """
        body = {
            "model": AgnesModels.VIDEO,
            "prompt": prompt,
            "num_frames": num_frames,
            "frame_rate": frame_rate,
        }
        if image_path:
            with open(image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            body["image"] = b64

        print("  提交视频任务...")
        resp = requests.post(f"{self.base_url}/videos",
                             headers=self._headers(), json=body, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"Agnes Video Create Error ({resp.status_code}): {resp.text[:500]}")

        data = resp.json()
        video_id = data.get("video_id") or data.get("id") or ""
        if not video_id:
            raise RuntimeError(f"No video_id in response: {data}")
        print(f"  视频任务已提交，ID: {video_id}，等待生成中...")

        start = time.time()
        while time.time() - start < max_wait:
            poll = requests.get(
                f"{self.base_url}/agnesapi?video_id={video_id}",
                headers=self._headers(), timeout=30)
            if poll.status_code != 200:
                time.sleep(interval)
                continue
            result = poll.json()
            status = result.get("status", "").lower()
            progress = result.get("progress", 0)
            print(f"  [{int(time.time()-start)}s] {status} {progress}%")
            if status in ("completed", "done", "succeeded"):
                video_url = result.get("video_url")
                if not video_url:
                    url_field = result.get("url", "")
                    video_url = url_field if isinstance(url_field, str) else \
                                url_field.get("video_url", "") if isinstance(url_field, dict) else ""
                if video_url:
                    print("  视频已生成，正在下载...")
                    r = requests.get(video_url, timeout=300)
                    if not output_path:
                        vid_dir = "F:/ClaudeWork/Video"
                        os.makedirs(vid_dir, exist_ok=True)
                        output_path = f"{vid_dir}/agnes_video_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
                    with open(output_path, "wb") as f:
                        f.write(r.content)
                    print(f"  ✅ 视频保存到: {output_path} ({len(r.content)//1024}KB)")
                    return output_path
                else:
                    raise RuntimeError("视频生成完成但未找到下载链接")
            elif status in ("failed", "error"):
                raise RuntimeError(f"Video generation failed: {result}")
            time.sleep(interval)

        raise TimeoutError(f"Video generation timeout after {max_wait}s, video_id={video_id}")
