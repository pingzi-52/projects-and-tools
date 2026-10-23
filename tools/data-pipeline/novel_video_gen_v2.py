# -*- coding: utf-8 -*-
"""
求生：唯一MC玩家 - 第一章 AI短剧 v2
策略：先生成写实图片(agnes-image-2.1) → 再图生视频(agnes-video-v2.0)
"""
import sys, os, io, time, requests, base64, json
from datetime import datetime
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ============================================================
# 配置
# ============================================================
AGNES_KEY = os.getenv("AGNES_KEY", "")
AGNES_BASE = "https://apihub.agnes-ai.com/v1"
VIDEO_DIR = "F:/ClaudeWork/Video/novel_ch1_v2"
IMG_DIR = os.path.join(VIDEO_DIR, "images")
os.makedirs(VIDEO_DIR, exist_ok=True)
os.makedirs(IMG_DIR, exist_ok=True)

HEADERS = {"Content-Type": "application/json", "Authorization": f"Bearer {AGNES_KEY}"}

# ============================================================
# 场景定义
# ============================================================
SCENES = [
    {
        "id": 1, "title": "系统提示",
        "img_prompt": """A dark empty void, cinematic wide shot. Floating golden holographic glowing text in the center reads 'Welcome to the Survival Game'. Subtle blue neon rim light, deep black space background with faint stars, mysterious atmosphere, photorealistic documentary footage, shot on ARRI Alexa, 35mm lens, raw ungraded look, no digital art style""",
        "vid_prompt": "Dark void with golden floating holographic text, subtle blue neon glow, mysterious ambient light, camera slowly pushes in, photorealistic handheld documentary style",
    },
    {
        "id": 2, "title": "穿越觉醒",
        "img_prompt": """A young Asian man in his early 20s floating in empty space, eyes wide open in shock and terror. He wears dark casual clothes. Around him, fragmented grey stone landmasses float in a purple-pink stormy sky with lightning cracks. His expression is terrified. Photorealistic portrait, shot on RED camera, shallow depth of field, volumetric lighting, realistic skin texture, no anime or cartoon style, documentary footage aesthetic""",
        "vid_prompt": "Young Asian man floating in dark purple storm sky surrounded by floating rock fragments, he opens his eyes in terror, camera slowly orbits around him, dramatic lighting, photorealistic handheld feel",
    },
    {
        "id": 3, "title": "方块村庄",
        "img_prompt": """Wide aerial drone shot looking down at a small village made of wooden block houses with thatched roofs, surrounded by square-crown green trees. A lone man stands in the dirt clearing at the center. Golden hour sunlight casting long shadows. Realistic photography of a miniature-style village, like a photorealistic diorama photographed with a drone, warm sunset colors, 4K, no animation or cartoon style""",
        "vid_prompt": "Aerial drone shot descending slowly over a small block-style village at golden hour, lone figure standing in center, warm sunset lighting, photorealistic smooth cinematic movement",
    },
    {
        "id": 4, "title": "系统面板",
        "img_prompt": """Close-up shot of a semi-transparent glowing holographic UI panel floating in mid-air against a dark blurred forest background. The panel displays game statistics with a health bar at 100 percent, loyalty indicator at 91 percent, territory count showing small human figures. Cool blue cyan glow, clean modern sci-fi interface, shallow depth of field, bokeh forest in background, photorealistic macro photography""",
        "vid_prompt": "Semi-transparent blue holographic game UI panel floating in air displaying stats, cool tech glow, camera slowly zooms in, photorealistic shallow depth of field",
    },
    {
        "id": 5, "title": "区域聊天",
        "img_prompt": """Extreme close-up of a modern smartphone screen held in someone's hand. The screen shows a messaging app with multiple blue chat bubbles containing distorted unreadable text lines. The phone has a black bezel. Dark room lighting with the phone screen as the only light source illuminating the fingers. Photorealistic macro photography, shallow depth of field, realistic skin texture on fingers, cinematic color grading""",
        "vid_prompt": "Close-up of smartphone screen showing chat messages with blue bubbles, hand holding the phone, dark room ambient light from screen, camera slightly shakes like handheld, photorealistic",
    },
    {
        "id": 6, "title": "建设开始",
        "img_prompt": """Low-angle action shot of a young man's fist punching a large floating grey stone block. The block is cracking with bright orange and gold sparks flying outward in all directions. Warm sunset backlight creating dramatic silhouette. Dirt ground below, scattered stone fragments. High-energy action moment, shot on cinema camera, photorealistic, realistic physics, no slow motion exaggeration""",
        "vid_prompt": "Young man punches a floating stone block, block cracks and explodes into glowing orange particles and sparks, sunset golden hour backlight, dynamic camera shake, photorealistic action shot",
    },
]

# ============================================================
# Agnes Client
# ============================================================
class AgnesClient:
    def __init__(self):
        self.headers = HEADERS

    def generate_image(self, prompt, output_path):
        """文生图 - 直接返回URL"""
        body = {"model": "agnes-image-2.1-flash", "prompt": prompt, "size": "1024x1024"}
        resp = requests.post(f"{AGNES_BASE}/images/generations", headers=self.headers, json=body, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"图片创建失败 ({resp.status_code}): {resp.text[:200]}")
        data = resp.json()
        img_url = data.get("data", [{}])[0].get("url", "")
        if not img_url:
            raise RuntimeError(f"无图片URL: {data}")
        print(f"  [图片] 下载中...")
        r = requests.get(img_url, timeout=120)
        with open(output_path, "wb") as f:
            f.write(r.content)
        print(f"  [图片] OK ({len(r.content)//1024}KB)")
        return output_path

    def generate_video(self, prompt, image_path, output_path):
        """图生视频"""
        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        body = {
            "model": "agnes-video-v2.0",
            "prompt": prompt,
            "image": b64,
            "num_frames": 121,
            "frame_rate": 24,
        }
        resp = requests.post(f"{AGNES_BASE}/videos", headers=self.headers, json=body, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"视频创建失败 ({resp.status_code}): {resp.text[:200]}")
        data = resp.json()
        video_id = data.get("video_id", "")
        if not video_id:
            raise RuntimeError(f"无video_id: {data}")
        print(f"  [视频] ID: {video_id[-12:]}... 等待生成...")

        start = time.time()
        while time.time() - start < 300:
            poll = requests.get(f"{AGNES_BASE}/agnesapi?video_id={video_id}",
                                headers=self.headers, timeout=30)
            if poll.status_code != 200:
                time.sleep(8)
                continue
            result = poll.json()
            status = result.get("status", "").lower()
            progress = result.get("progress", 0)
            elapsed = int(time.time() - start)
            print(f"  [视频] [{elapsed}s] {status} {progress}%")
            if status in ("completed", "done", "succeeded"):
                video_url = result.get("video_url", "")
                if not video_url:
                    uf = result.get("url", "")
                    if isinstance(uf, str): video_url = uf
                    elif isinstance(uf, dict): video_url = uf.get("video_url", "")
                if video_url:
                    print(f"  [视频] 下载中...")
                    r = requests.get(video_url, timeout=300)
                    with open(output_path, "wb") as f:
                        f.write(r.content)
                    print(f"  [视频] OK ({len(r.content)//1024}KB)")
                    return output_path
                raise RuntimeError("完成但无下载链接")
            elif status in ("failed", "error"):
                raise RuntimeError(f"视频失败: {result}")
            time.sleep(8)
        raise TimeoutError(f"超时 300s")


# ============================================================
# 主流程
# ============================================================
def main():
    print("=" * 55)
    print("求生：唯一MC玩家 - 第一章 AI短剧 v2 (图生视频)")
    print("=" * 55)

    client = AgnesClient()
    all_results = []

    for i, scene in enumerate(SCENES):
        print(f"\n{'─' * 40}")
        print(f"[{i+1}/{len(SCENES)}] {scene['title']}")

        scene_results = {"scene": scene, "image": None, "video": None, "error": None}

        # Step 1: 图片
        try:
            img_path = os.path.join(IMG_DIR, f"scene_{scene['id']:02d}.png")
            client.generate_image(scene['img_prompt'], img_path)
            scene_results["image"] = img_path
            print(f"  ✅ 图片完成")
        except Exception as e:
            print(f"  ❌ 图片失败: {e}")
            scene_results["error"] = str(e)
            all_results.append(scene_results)
            continue

        # Step 2: 视频
        try:
            vid_path = os.path.join(VIDEO_DIR, f"scene_{scene['id']:02d}_{scene['title']}.mp4")
            client.generate_video(scene['vid_prompt'], img_path, vid_path)
            scene_results["video"] = vid_path
            print(f"  ✅ 视频完成")
        except Exception as e:
            print(f"  ❌ 视频失败: {e}")
            scene_results["error"] = str(e)

        all_results.append(scene_results)

    # 统计
    ok = [r for r in all_results if r["video"]]
    fail = [r for r in all_results if not r["video"]]
    print(f"\n{'=' * 55}")
    print(f"完成: {len(ok)}/{len(all_results)}")
    if fail:
        print(f"失败: {[r['scene']['title'] for r in fail]}")
    print(f"输出目录: {VIDEO_DIR}")
    print(f"图片目录: {IMG_DIR}")

    # 合并
    if len(ok) > 1:
        try:
            import cv2
            files = sorted([r["video"] for r in all_results if r["video"]])
            output = os.path.join(VIDEO_DIR, "求生_唯一MC玩家_第一章_v2.mp4")
            cap0 = cv2.VideoCapture(files[0])
            fps = cap0.get(cv2.CAP_PROP_FPS)
            w = int(cap0.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap0.get(cv2.CAP_PROP_FRAME_HEIGHT))
            cap0.release()
            print(f"\n[合并] {w}x{h} @ {fps}fps")
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(output, fourcc, fps, (w, h))
            for f in files:
                cap = cv2.VideoCapture(f)
                cnt = 0
                while True:
                    ret, frame = cap.read()
                    if not ret: break
                    out.write(frame)
                    cnt += 1
                cap.release()
                print(f"  + {os.path.basename(f)} ({cnt}帧)")
            out.release()
            size_kb = os.path.getsize(output) // 1024
            print(f"[合并] OK: {output} ({size_kb}KB)")
        except Exception as e:
            print(f"[合并] 跳过: {e}")


if __name__ == "__main__":
    main()
