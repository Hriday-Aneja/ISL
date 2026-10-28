"""Tests for the WebSocket layer of recognition_service.py.

Run:  cd isl-connect/include-ml && python -m unittest test_recognition_service -v

Needs only `websockets` and `numpy`. The heavy ML stack (torch, MediaPipe, OpenCV, the checkpoint) is
replaced by stubs, so these tests cover the connection handling, NOT recognition accuracy
(use tools/protocol_check.py against a live service for the real model).
"""
import asyncio
import json
import sys
import threading
import time
import unittest
from unittest.mock import MagicMock

for _name in ("cv2", "mediapipe", "torch", "custom_common", "custom_model", "live_inference"):
    sys.modules[_name] = MagicMock()

import websockets  # noqa: E402

import recognition_service as rs  # noqa: E402


class FakeService:
    """Stands in for RecognitionService: same attributes handle_connection relies on."""

    min_frames = 8
    max_frames = 12

    def __init__(self, classify_delay=0.0):
        self.classify_delay = classify_delay
        self.fail_next = False
        self.classify_threads = []

    def info(self):
        return {"classes": 24, "labels": [f"L{i}" for i in range(24)]}

    def classify(self, frames, times, width, height):
        self.classify_threads.append(threading.current_thread().name)
        if self.classify_delay:
            time.sleep(self.classify_delay)  # blocking on purpose, like a real forward pass
        if self.fail_next:
            self.fail_next = False
            raise RuntimeError("model exploded")
        if len(frames) < self.min_frames:
            raise ValueError(f"Capture is too short ({len(frames)} frames; need at least {self.min_frames})")
        return {"label": "L0", "confidence": 0.9, "top": [], "frames": len(frames), "model_frames": len(frames), "inference_ms": 1.0}


class FakeTrackers:
    def __init__(self):
        self.closed = False
        self.thread_names = set()

    def process(self, jpeg_bytes):
        self.thread_names.add(threading.current_thread().name)
        if jpeg_bytes == b"bad":
            raise rs.InvalidFrame("Invalid JPEG frame")
        if jpeg_bytes == b"boom":
            raise RuntimeError("mediapipe crashed")
        return {"frame": 1}, 640, 360

    def close(self):
        self.closed = True


class OriginTests(unittest.TestCase):
    def test_allowed_and_rejected(self):
        allowed = rs.DEFAULT_ALLOWED_ORIGINS
        for origin in (
            None,  # non-browser client (scripts, protocol_check.py)
            "http://localhost:5173",
            "http://localhost",
            "http://127.0.0.1:4000",
            "https://samvaad-khaki.vercel.app",
            "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        ):
            self.assertTrue(rs.origin_allowed(origin, allowed), origin)
        for origin in (
            "https://evil.example",
            "http://localhost.evil.example",
            "http://localhost.evil.example:80",
            "https://samvaad-khaki.vercel.app.evil.example",
            "null",
            "https://meet.google.com",
        ):
            self.assertFalse(rs.origin_allowed(origin, allowed), origin)

    def test_check_can_be_disabled(self):
        self.assertTrue(rs.origin_allowed("https://evil.example", None))

    def test_build_allowed_origins(self):
        def args(**kw):
            base = dict(allow_any_origin=False, no_default_origins=False, allowed_origin=[])
            base.update(kw)
            return type("A", (), base)()

        self.assertIsNone(rs.build_allowed_origins(args(allow_any_origin=True)))
        self.assertEqual(rs.build_allowed_origins(args()), rs.DEFAULT_ALLOWED_ORIGINS)
        pinned = rs.build_allowed_origins(args(no_default_origins=True, allowed_origin=["chrome-extension://abc"]))
        self.assertEqual(pinned, ("chrome-extension://abc",))
        self.assertFalse(rs.origin_allowed("chrome-extension://zzz", pinned))
        self.assertTrue(rs.origin_allowed("chrome-extension://abc", pinned))


class ServerTestCase(unittest.IsolatedAsyncioTestCase):
    service_delay = 0.0

    async def asyncSetUp(self):
        self.service = FakeService(self.service_delay)
        self.trackers = []

        def factory():
            tracker = FakeTrackers()
            self.trackers.append(tracker)
            return tracker

        self.server = await websockets.serve(
            lambda ws: rs.handle_connection(ws, self.service, rs.DEFAULT_ALLOWED_ORIGINS, factory),
            "127.0.0.1",
            0,
        )
        self.url = f"ws://127.0.0.1:{self.server.sockets[0].getsockname()[1]}"

    async def asyncTearDown(self):
        self.server.close()
        await self.server.wait_closed()

    async def recv(self, ws, timeout=5):
        return json.loads(await asyncio.wait_for(ws.recv(), timeout))

    async def capture(self, ws, frames, stop=True):
        await ws.send(json.dumps({"type": "start"}))
        self.assertEqual(await self.recv(ws), {"type": "status", "status": "capturing"})
        for _ in range(frames):
            await ws.send(b"jpeg")
        if stop:
            await ws.send(json.dumps({"type": "stop"}))


class ProtocolTests(ServerTestCase):
    async def test_happy_path_unchanged(self):
        async with websockets.connect(self.url) as ws:
            self.assertEqual((await self.recv(ws))["type"], "ready")
            await self.capture(ws, 10)
            prediction = await self.recv(ws)
            self.assertEqual(prediction["type"], "prediction")
            self.assertEqual(prediction["frames"], 10)

    async def test_too_short_clip_reports_error(self):
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            await self.capture(ws, 3)
            error = await self.recv(ws)
            self.assertEqual(error["type"], "error")
            self.assertIn("too short", error["message"].lower())

    async def test_auto_finish_at_max_frames(self):
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            await self.capture(ws, self.service.max_frames, stop=False)
            self.assertEqual((await self.recv(ws))["type"], "prediction")
            self.assertEqual(await self.recv(ws), {"type": "status", "status": "idle"})

    async def test_auto_finish_classify_error_keeps_connection(self):
        """Bug #2: an exception in the auto-finish branch used to end the whole connection."""
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            self.service.fail_next = True
            await self.capture(ws, self.service.max_frames, stop=False)
            error = await self.recv(ws)
            self.assertEqual(error["type"], "error")
            self.assertIn("model exploded", error["message"])
            self.assertEqual(await self.recv(ws), {"type": "status", "status": "idle"})
            # connection is still usable: a second capture works
            await self.capture(ws, 10)
            self.assertEqual((await self.recv(ws))["type"], "prediction")

    async def test_stop_classify_error_keeps_connection(self):
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            self.service.fail_next = True
            await self.capture(ws, 10)
            self.assertEqual((await self.recv(ws))["type"], "error")
            await self.capture(ws, 10)
            self.assertEqual((await self.recv(ws))["type"], "prediction")

    async def test_malformed_json_keeps_connection(self):
        """Bug #3: malformed or non-object JSON used to kill the connection."""
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            for bad in ("{not json", "[1, 2]", "42", "null"):
                await ws.send(bad)
                self.assertEqual((await self.recv(ws))["type"], "error", bad)
            await self.capture(ws, 10)
            self.assertEqual((await self.recv(ws))["type"], "prediction")

    async def test_unknown_and_stray_commands_are_ignored(self):
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            await ws.send(json.dumps({"type": "ping"}))
            await ws.send(json.dumps({"type": "stop"}))  # stop without start
            await ws.send(b"jpeg")  # frame while not capturing
            await self.capture(ws, 10)
            self.assertEqual((await self.recv(ws))["type"], "prediction")

    async def test_bad_frames_do_not_end_session(self):
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            await ws.send(json.dumps({"type": "start"}))
            await self.recv(ws)
            await ws.send(b"bad")
            self.assertEqual(await self.recv(ws), {"type": "error", "message": "Invalid JPEG frame"})
            await ws.send(b"boom")
            self.assertIn("Frame processing failed", (await self.recv(ws))["message"])
            for _ in range(10):
                await ws.send(b"jpeg")
            await ws.send(json.dumps({"type": "stop"}))
            prediction = await self.recv(ws)
            self.assertEqual((prediction["type"], prediction["frames"]), ("prediction", 10))

    async def test_trackers_closed_on_disconnect(self):
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            await self.capture(ws, 2, stop=False)
            await asyncio.sleep(0.1)
        for _ in range(50):
            if self.trackers and self.trackers[0].closed:
                break
            await asyncio.sleep(0.05)
        self.assertTrue(self.trackers[0].closed)

    async def test_work_runs_off_the_event_loop_thread(self):
        async with websockets.connect(self.url) as ws:
            await self.recv(ws)
            await self.capture(ws, 10)
            await self.recv(ws)
        main = threading.current_thread().name
        self.assertTrue(self.trackers[0].thread_names)
        self.assertNotIn(main, self.trackers[0].thread_names)
        self.assertNotIn(main, self.service.classify_threads)


class OriginHandshakeTests(ServerTestCase):
    async def test_foreign_origin_is_closed_before_ready(self):
        async with websockets.connect(self.url, origin="https://evil.example") as ws:
            with self.assertRaises(websockets.exceptions.ConnectionClosed) as ctx:
                await asyncio.wait_for(ws.recv(), 5)
        self.assertEqual(ctx.exception.rcvd.code, 1008)

    async def test_allowed_origins_get_ready(self):
        for origin in ("http://localhost:5173", "chrome-extension://abcdefghijklmnopabcdefghijklmnop", None):
            async with websockets.connect(self.url, origin=origin) as ws:
                self.assertEqual((await self.recv(ws))["type"], "ready", origin)


class SlowInferenceTests(ServerTestCase):
    service_delay = 0.6

    async def test_slow_inference_does_not_freeze_other_clients(self):
        """Bug #1: classify/MediaPipe ran on the event loop, so one client's inference stalled all."""
        gaps = []

        async def heartbeat(stop):
            last = time.perf_counter()
            while not stop.is_set():
                await asyncio.sleep(0.01)
                now = time.perf_counter()
                gaps.append(now - last)
                last = now

        async with websockets.connect(self.url) as slow, websockets.connect(self.url) as other:
            await self.recv(slow)
            await self.recv(other)
            stop = asyncio.Event()
            beat = asyncio.create_task(heartbeat(stop))
            await self.capture(slow, 10)  # starts a 0.6 s blocking classify
            await asyncio.sleep(0.05)
            started = time.perf_counter()
            await other.send(json.dumps({"type": "start"}))
            status = await self.recv(other, timeout=2)
            other_latency = time.perf_counter() - started
            self.assertEqual(status["status"], "capturing")
            self.assertEqual((await self.recv(slow))["type"], "prediction")
            stop.set()
            await beat
        self.assertLess(other_latency, 0.3, f"other client waited {other_latency:.2f}s behind slow inference")
        self.assertLess(max(gaps), 0.3, f"event loop stalled for {max(gaps):.2f}s")


if __name__ == "__main__":
    unittest.main()
