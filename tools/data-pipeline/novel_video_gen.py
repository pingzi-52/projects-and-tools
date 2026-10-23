# -*- coding: utf-8 -*-
"""
求生：唯一MC玩家 - 第一章 AI 短剧生成器
"""
import sys, os, io, time, requests, base64, json
from datetime import datetime
from pathlib import Path
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ============================================================
# 配置
# ============================================================
AGNES_KEY = os.getenv("AGNES_KEY", "")
AGNES_BASE = "https://apihub.agnes-ai.com/v1"
VIDEO_DIR = "F:/ClaudeWork/Video/novel_ch1"
os.makedirs(VIDEO_DIR, exist_ok=True)

# ============================================================
# 6个场景的英文提示词（AI视频对英文理解更好）
# ============================================================
SCENES = [
    {
        "id": 1,
        "title": "系统提示",
        "prompt": """Dark void space, cinematic sci-fi atmosphere. Golden holographic UI text floating in the darkness: 'Welcome to the全民求生游戏'. Subtle blue neon glow, mysterious ambient light, 4K quality, slow camera push-in, atmospheric fog, epic cinematic lighting""",
        "duration": 4,
    },
    {
        "id": 2,
        "title": "穿越觉醒",
        "prompt": """A young man opens his eyes in shock, floating in empty space. Below him, fragmented land masses float in the sky without any support. Blocky voxel-style terrain visible in the distance. Surreal apocalyptic atmosphere, cinematic wide shot, volumetric lighting, dramatic clouds, 4K quality""",
        "duration": 5,
    },
    {
        "id": 3,
        "title": "方块村庄",
        "prompt": """Aerial view of a Minecraft-style village made of pixel blocks. Small wooden houses, blocky trees, dirt paths. A lone figure stands in the center looking around in awe. Warm golden hour lighting, gentle camera orbit, detailed voxel art style mixed with realistic rendering, cinematic 4K""",
        "duration": 5,
    },
    {
        "id": 4,
        "title": "系统面板",
        "prompt": """Semi-transparent holographic UI panel floating in mid-air, displaying game stats: 'Territory: 9 villagers, 2 iron golems, Health 100, Loyalty 91'. Blue tech glow, futuristic sci-fi interface, clean minimal design, subtle data animations, close-up shot, 4K quality""",
        "duration": 4,
    },
    {
        "id": 5,
        "title": "区域聊天",
        "prompt": """Smartphone screen close-up showing a chat application interface. Scrolling messages from other players in Chinese text, panicked and excited tones. Blue message bubbles, dark mode UI, realistic phone reflection, shallow depth of field, cinematic lighting, 4K""",
        "duration": 4,
    },
    {
        "id": 6,
        "title": "建设开始",
        "prompt": """A young man raises his fist and punches a floating block. The block cracks and shatters into glowing particles that turn into resources. Warm sunset golden light, dynamic action camera, particle effects, satisfying block destruction animation, cinematic 4K quality""",
        "duration": 5,
    },
]

# ============================================================
# Agnes Video Client
# ============================================================
class AgnesVideoClient:
    def __init__(self, api_key, base_url):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    def generate(self, prompt, output_path=None, max_wait=300, interval=8):
        """提交视频生成任务并等待完成"""
        body = {
            "model": "agnes-video-v2.0",
            "prompt": prompt,
            "num_frames": 121,
            "frame_rate": 24,
        }
        print(f"  [提交] {prompt[:60]}...")
        resp = requests.post(f"{self.base_url}/videos", headers=self.headers, json=body, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"创建失败 ({resp.status_code}): {resp.text[:200]}")
        data = resp.json()
        video_id = data.get("video_id") or data.get("id") or ""
        if not video_id:
            raise RuntimeError(f"无video_id: {data}")
        print(f"  [ID] {video_id}，等待生成...")

        start = time.time()
        while time.time() - start < max_wait:
            poll = requests.get(f"{self.base_url}/agnesapi?video_id={video_id}",
                                headers=self.headers, timeout=30)
            if poll.status_code != 200:
                time.sleep(interval)
                continue
            result = poll.json()
            status = result.get("status", "").lower()
            progress = result.get("progress", 0)
            elapsed = int(time.time() - start)
            print(f"  [{elapsed}s] {status} {progress}%")
            if status in ("completed", "done", "succeeded"):
                video_url = result.get("video_url", "")
                if not video_url:
                    uf = result.get("url", "")
                    if isinstance(uf, str):
                        video_url = uf
                    elif isinstance(uf, dict):
                        video_url = uf.get("video_url", "")
                if video_url:
                    print(f"  [下载] 开始下载...")
                    r = requests.get(video_url, timeout=300)
                    if not output_path:
                        output_path = f"{VIDEO_DIR}/scene_{int(time.time())}.mp4"
                    with open(output_path, "wb") as f:
                        f.write(r.content)
                    size_kb = len(r.content) // 1024
                    print(f"  [完成] {output_path} ({size_kb}KB)")
                    return output_path
                else:
                    raise RuntimeError("生成完成但无下载链接")
            elif status in ("failed", "error"):
                raise RuntimeError(f"生成失败: {result}")
            time.sleep(interval)
        raise TimeoutError(f"超时 {max_wait}s")

# ============================================================
# 主流程
# ============================================================
def main():
    print("=" * 50)
    print("求生：唯一MC玩家 - 第一章 AI短剧生成")
    print("=" * 50)

    client = AgnesVideoClient(AGNES_KEY, AGNES_BASE)
    results = []

    for i, scene in enumerate(SCENES):
        print(f"\n[{i+1}/{len(SCENES)}] {scene['title']}")
        print(f"  时长: {scene['duration']}s")
        try:
            out_path = f"{VIDEO_DIR}/scene_{scene['id']:02d}_{scene['title']}.mp4"
            path = client.generate(scene['prompt'], output_path=out_path)
            results.append({"scene": scene, "path": path})
            print(f"  ✅ 完成")
        except Exception as e:
            print(f"  ❌ 失败: {e}")
            results.append({"scene": scene, "path": None, "error": str(e)})

    # 统计
    ok = [r for r in results if r["path"]]
    fail = [r for r in results if not r["path"]]
    print("\n" + "=" * 50)
    print(f"完成: {len(ok)}/{len(results)}")
    if fail:
        print(f"失败: {[r['scene']['title'] for r in fail]}")
    print(f"输出目录: {VIDEO_DIR}")
    print("=" * 50)

    # 尝试合并（如果ffmpeg可用）
    if len(ok) > 1:
        try:
            import subprocess
            list_file = f"{VIDEO_DIR}/concat_list.txt"
            with open(list_file, "w", encoding="utf-8") as f:
                for r in results:
                    if r["path"]:
                        f.write(f"file '{r['path']}'\n")
            output = f"{VIDEO_DIR}/求生_唯一MC玩家_第一章.mp4"
            print(f"\n[合并] 正在合并视频...")
            subprocess.run([
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", list_file, "-c", "copy", output
            ], check=True, capture_output=True)
            print(f"[合并] ✅ {output}")
        except Exception as e:
            print(f"[合并] 跳过: {e}")

if __name__ == "__main__":
    main()
