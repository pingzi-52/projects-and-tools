"""
图片瘦脸 + 滤镜工具 v2
修复瘦脸算法 — 水平压缩脸颊区域
"""
import cv2
import numpy as np

# ---------- 配置 ----------
INPUT_IMAGE = "photos/20260617-153421.jpg"
OUTPUT_IMAGE = "photos/20260617-153421_out.jpg"
SLIM_STRENGTH = 0.18            # 瘦脸强度 0~1, 越大脸越瘦 (建议0.1~0.3)
FILTER_MODE = "beauty"          # "beauty" | "warm" | "cool" | "vintage" | "none"
# ------------------------


def detect_faces(img):
    """检测人脸，返回人脸列表"""
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))
    return faces  # [(x, y, w, h), ...]


def slim_face_horizontal(img, face_rect, strength):
    """
    水平方向瘦脸：以脸部中轴线为基准，向中心压缩两颊
    - 中轴线（鼻子）几乎不动
    - 越靠近脸颊两侧，压缩越强
    """
    h, w = img.shape[:2]
    x, y, fw, fh = face_rect

    # 脸部中轴线
    cx = x + fw // 2

    # 扩展处理区域（比脸部矩形略大，用于过渡）
    margin_x = int(fw * 0.3)
    margin_y = int(fh * 0.3)
    x1 = max(0, x - margin_x)
    x2 = min(w, x + fw + margin_x)
    y1 = max(0, y - margin_y)
    y2 = min(h, y + fh + margin_y)

    # 创建椭圆权重蒙版 — 中心为0（不动），边缘为1（最大压缩）
    mask = np.zeros((h, w), dtype=np.float32)
    cy_face = y + fh // 2
    rx = fw // 2 + margin_x
    ry = fh // 2 + margin_y
    cv2.ellipse(mask, (cx, cy_face), (rx, ry), 0, 0, 360, 1.0, -1)

    # 权重随水平距离增加：中轴线 weight=0，两侧 weight→1
    # weight = |x - cx| / (fw/2) ，裁剪到 [0, 1]
    xs = np.arange(w, dtype=np.float32).reshape(1, w)
    weight = np.abs(xs - cx) / (fw / 2.0)
    weight = np.clip(weight, 0, 1)  # (1, w)

    # 只处理椭圆内的区域
    weight = weight * mask  # (h, w) broadcast

    # 高斯模糊让过渡更自然
    weight = cv2.GaussianBlur(weight, (41, 41), 20)

    # 构建 remap：水平方向压缩
    # 对于每个输出像素(x_out, y)，它的值取自输入像素(x_in, y)
    # x_in = cx + (x_out - cx) / (1 - strength * weight)
    # 当 weight=0（中轴线处），x_in = x_out（不动）
    # 当 weight=1（脸颊侧），x_in = cx + (x_out - cx) / (1-strength)（从更远处取像素→压缩）
    shrink = 1.0 / (1.0 + strength * weight)  # 收缩因子 ≤ 1

    ys, xs_out = np.mgrid[0:h, 0:w]
    dx = xs_out - cx
    xs_in = cx + dx * shrink

    map_x = xs_in.astype(np.float32)
    map_y = ys.astype(np.float32)

    result = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return result


# ---------- 滤镜 ----------

def apply_beauty(img):
    """美白磨皮"""
    blur = cv2.bilateralFilter(img, 9, 75, 75)
    bright = cv2.addWeighted(img, 0.65, blur, 0.35, 0)
    bright = cv2.convertScaleAbs(bright, alpha=1.12, beta=8)
    detail = img.astype(np.float32) - blur.astype(np.float32)
    result = bright.astype(np.float32) + detail * 0.5
    return np.clip(result, 0, 255).astype(np.uint8)


def apply_warm(img):
    """暖色调"""
    r = img.copy().astype(np.int16)
    r[:, :, 2] += 22; r[:, :, 1] += 10; r[:, :, 0] -= 12
    return np.clip(r, 0, 255).astype(np.uint8)


def apply_cool(img):
    """冷色调"""
    r = img.copy().astype(np.int16)
    r[:, :, 0] += 22; r[:, :, 2] -= 12
    return np.clip(r, 0, 255).astype(np.uint8)


def apply_vintage(img):
    """复古"""
    r = img.copy().astype(np.int16)
    r[:, :, 2] += 18; r[:, :, 1] += 6
    r = np.clip(r, 0, 255).astype(np.uint8)
    gray = cv2.cvtColor(r, cv2.COLOR_BGR2GRAY)
    r = cv2.addWeighted(r, 0.55, cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR), 0.45, 0)
    h, w = r.shape[:2]
    X, Y = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-1, 1, h))
    v = np.clip(1 - 0.35 * np.sqrt(X**2 + Y**2), 0, 1)
    for c in range(3):
        r[:, :, c] = (r[:, :, c] * v).astype(np.uint8)
    return r


FILTERS = {
    "beauty": apply_beauty,
    "warm": apply_warm,
    "cool": apply_cool,
    "vintage": apply_vintage,
    "none": lambda x: x,
}


def main():
    print(f"读取: {INPUT_IMAGE}")
    img = cv2.imread(INPUT_IMAGE)
    if img is None:
        print("图片未找到")
        return

    oh, ow = img.shape[:2]
    print(f"尺寸: {ow} x {oh}")

    # 大图先缩小加速
    scale = 1.0
    if max(ow, oh) > 1200:
        scale = 1200 / max(ow, oh)
        img = cv2.resize(img, (int(ow * scale), int(oh * scale)))

    # 1. 瘦脸
    print("检测人脸...")
    faces = detect_faces(img)
    if len(faces) > 0:
        for (fx, fy, fw, fh) in faces:
            img = slim_face_horizontal(img, (fx, fy, fw, fh), SLIM_STRENGTH)
        print(f"  检测到 {len(faces)} 张脸, 瘦脸强度 {SLIM_STRENGTH}")
    else:
        print("  未检测到人脸, 跳过瘦脸")

    # 2. 滤镜
    if FILTER_MODE != "none":
        print(f"滤镜: {FILTER_MODE}")
        img = FILTERS[FILTER_MODE](img)

    # 恢复尺寸
    if scale != 1.0:
        img = cv2.resize(img, (ow, oh))

    cv2.imwrite(OUTPUT_IMAGE, img)
    print(f"Done -> {OUTPUT_IMAGE}")


if __name__ == "__main__":
    main()
