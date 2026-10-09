"""
Pre-event: export an Ultralytics nano pose model to ONNX for in-browser inference (onnxruntime-web).

    python3 -m venv .venv && . .venv/bin/activate
    pip install ultralytics onnx onnxslim
    python scripts/export_pose_onnx.py            # default yolo11n-pose.pt
    POSE_MODEL=yolo26n-pose.pt python scripts/export_pose_onnx.py   # try the newer nano pose if available

Writes public/models/pose.onnx (gitignored). 320 px input keeps phones fast; FP16 halves the download.
Benchmark on the phone afterwards: YOLO is kept only at >= 15 fps (config/protocol.default.json -> pose).
"""
import os
import shutil
from pathlib import Path

from ultralytics import YOLO

model_name = os.environ.get("POSE_MODEL", "yolo11n-pose.pt")
imgsz = int(os.environ.get("POSE_IMGSZ", "320"))

model = YOLO(model_name)
out = model.export(format="onnx", imgsz=imgsz, half=True, simplify=True, dynamic=False)

dest = Path(__file__).resolve().parent.parent / "public" / "models" / "pose.onnx"
dest.parent.mkdir(parents=True, exist_ok=True)
shutil.copy(out, dest)
print(f"wrote {dest} ({dest.stat().st_size / 1e6:.1f} MB) from {model_name} at {imgsz}px")
