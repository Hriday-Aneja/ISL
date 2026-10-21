"""End-to-end check of the live recognition_service.py WebSocket protocol, exactly as the extension uses it.

Start the service first (see README), then:  python tools/protocol_check.py --url ws://127.0.0.1:8765
Frames are synthetic (no person), so MediaPipe finds no landmarks; this verifies the protocol, JPEG decoding,
preprocessing, model forward pass and response shape, NOT recognition accuracy.
"""
import argparse
import asyncio
import json

import cv2
import numpy as np
import websockets


def jpeg(i, w=640, h=360):
    img = np.full((h, w, 3), 90, np.uint8)
    cv2.circle(img, (100 + 5 * i, 180), 40, (200, 160, 120), -1)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


async def recv(ws, timeout=20):
    return json.loads(await asyncio.wait_for(ws.recv(), timeout))


async def main(url):
    results = []

    def check(name, cond, detail=""):
        results.append(cond)
        print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")

    async with websockets.connect(url, max_size=None) as ws:
        ready = await recv(ws)
        svc = ready.get("service", {})
        check("ready message with 24 labels", ready.get("type") == "ready" and len(svc.get("labels", [])) == 24, f"classes={svc.get('classes')} seq={svc.get('sequence_length')} fps={svc.get('train_fps')}")
        check("ready reports flip_horizontal", "flip_horizontal" in svc, f"flip_horizontal={svc.get('flip_horizontal')}")

        await ws.send(json.dumps({"type": "start"}))
        st = await recv(ws)
        check("start -> status capturing", st == {"type": "status", "status": "capturing"}, str(st))
        for i in range(20):
            await ws.send(jpeg(i))
        await ws.send(json.dumps({"type": "stop"}))
        pred = await recv(ws)
        top = pred.get("top", [])
        check("stop -> prediction", pred.get("type") == "prediction" and pred.get("label") in svc["labels"], f"label={pred.get('label')} conf={pred.get('confidence')}")
        check("top-5 sorted, probabilities valid", len(top) == 5 and all(top[i]["confidence"] >= top[i + 1]["confidence"] for i in range(4)) and 0 < pred["confidence"] <= 1)
        check("frames counted", pred.get("frames") == 20, f"frames={pred.get('frames')} model_frames={pred.get('model_frames')} {pred.get('inference_ms')}ms")

        await ws.send(json.dumps({"type": "start"}))
        await recv(ws)
        for i in range(3):
            await ws.send(jpeg(i))
        await ws.send(json.dumps({"type": "stop"}))
        err = await recv(ws)
        check("too-short clip -> error message", err.get("type") == "error" and "too short" in err.get("message", "").lower(), err.get("message", ""))

        await ws.send(json.dumps({"type": "start"}))
        await recv(ws)
        await ws.send(b"not a jpeg")
        err = await recv(ws)
        check("invalid frame -> error, connection survives", err.get("type") == "error" and "Invalid JPEG" in err.get("message", ""), err.get("message", ""))
        await ws.send(json.dumps({"type": "stop"}))
        await recv(ws)  # too short

        max_frames = min(256, svc["sequence_length"])
        await ws.send(json.dumps({"type": "start"}))
        await recv(ws)
        for i in range(max_frames):
            await ws.send(jpeg(i))
        auto = await recv(ws, 60)
        idle = await recv(ws)
        check("auto-finish at max frames without stop", auto.get("type") == "prediction" and idle == {"type": "status", "status": "idle"}, f"max_frames={max_frames}")

    async with websockets.connect(url, max_size=None) as ws2:
        await recv(ws2)
        await ws2.send(json.dumps({"type": "start"}))
        await recv(ws2)
        await ws2.send(jpeg(0))
    async with websockets.connect(url, max_size=None) as ws3:
        again = await recv(ws3)
        check("service survives client dropping mid-capture", again.get("type") == "ready")

    print(f"\n{sum(results)}/{len(results)} checks passed")
    raise SystemExit(0 if all(results) else 1)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="ws://127.0.0.1:8765")
    asyncio.run(main(p.parse_args().url))
