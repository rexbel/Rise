"""
Tier 3 fallback only: YOLO pose on the laptop, for phones too slow for on-device YOLO and MediaPipe.
Day-of: add a WebSocket endpoint that accepts JPEG frames and returns 17 keypoints per frame.

    cd services/rise-pose && python3 -m venv .venv && . .venv/bin/activate
    pip install -r requirements.txt && uvicorn main:app --port 8001
"""
from fastapi import FastAPI

app = FastAPI(title="rise-pose")


@app.get("/health")
def health() -> dict:
    return {"ok": True}
