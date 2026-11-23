"""Ephemeral scan work. No image, prediction or gallery survives a request."""
import base64
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
import io
import re
from time import perf_counter

_current = ContextVar("face_frame", default=None)


class FrameWork:
    def __init__(self):
        self.source = None
        self.rgb = None
        self.bgr = None
        self.predictions = {}
        self.models = {}
        self.galleries = {}
        self.timings = {}
        self.entrance = False
        self.detections = {}
        self.min_face_pixels = None

    def clear(self):
        self.source = self.rgb = self.bgr = None
        self.predictions.clear()
        self.models.clear()
        self.galleries.clear()
        self.detections.clear()
        self.min_face_pixels = None
        self.entrance = False

    def prepare(self, source):
        if self.source is None or self.source != source:
            self.source = self.rgb = self.bgr = None
            self.predictions.clear()
            self.detections.clear()
            self.min_face_pixels = None
            with measure_stage("decode"):
                self.rgb = _decode_rgb(source)
            self.source = source
        return self.rgb

    def header(self):
        return ", ".join(f"{name};dur={seconds * 1000:.2f}"
                         for name, seconds in self.timings.items())


def current_frame():
    return _current.get()


@contextmanager
def frame_scope():
    state = FrameWork()
    token = _current.set(state)
    started = perf_counter()
    try:
        yield state
    finally:
        state.timings["total"] = perf_counter() - started
        state.clear()
        _current.reset(token)


@contextmanager
def measure_stage(name):
    state = current_frame()
    if state is None:
        yield
        return
    started = perf_counter()
    try:
        yield
    finally:
        state.timings[name] = state.timings.get(name, 0) + perf_counter() - started


def timed_stage(name):
    def decorate(function):
        @wraps(function)
        def measured(*args, **kwargs):
            with measure_stage(name):
                return function(*args, **kwargs)
        return measured
    return decorate


def _decode_rgb(source):
    import numpy as np
    from PIL import Image, ImageOps

    raw = source.split(",", 1)[1] if "," in source else source
    data = base64.b64decode(raw, validate=True)
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > 4_000_000:
            raise ValueError("Camera frame is too large")
        return np.array(ImageOps.exif_transpose(image).convert("RGB"))


def decode_rgb(source):
    state = current_frame()
    return state.prepare(source) if state is not None else _decode_rgb(source)


def decode_bgr(source):
    import cv2

    state = current_frame()
    rgb = decode_rgb(source)
    if state is None:
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    if state.bgr is None:
        state.bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    return state.bgr


def pad_prediction(model, patch, compute):
    state = current_frame()
    if state is None:
        return compute()
    # Compare the exact model input, never identity, geometry or a prior frame.
    key = (id(model), patch.shape, patch.dtype.str, patch.tobytes())
    if key in state.predictions:
        return state.predictions[key]
    result = compute()  # Failed/uncertain inference is never replaced by a cache.
    if len(state.predictions) < 32:
        state.models[id(model)] = model
        state.predictions[key] = result
    return result


def gallery_read(db, engine, excluded_id, load):
    state = current_frame()
    if state is None:
        return load()
    key = (db, engine, excluded_id)
    if key not in state.galleries:
        state.galleries[key] = load()
    return state.galleries[key]


def invalidate_gallery(db):
    state = current_frame()
    if state is not None:
        for key in list(state.galleries):
            if key[0] is db:
                del state.galleries[key]


class FaceFrameMiddleware:
    """Share work with FastAPI worker threads; expose numeric timings only."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        enabled = scope.get("type") == "http" and scope.get("method") == "POST" and (
            path in {"/api/auth/face", "/api/auth/face-lookup", "/api/kiosk/face", "/api/auth/enroll-face"}
            or re.fullmatch(r"/api/librarian/users/[0-9]+/enroll-face", path)
        )
        if not enabled:
            return await self.app(scope, receive, send)
        started = perf_counter()
        with frame_scope() as state:
            state.entrance = path == "/api/kiosk/face"
            async def timed_send(message):
                if message["type"] == "http.response.start":
                    from starlette.datastructures import MutableHeaders
                    state.timings["total"] = perf_counter() - started
                    headers = MutableHeaders(scope=message)
                    headers.append("server-timing", state.header())
                    if state.entrance and state.rgb is not None:
                        height, width = state.rgb.shape[:2]
                        headers["x-entry-frame-width"] = str(width)
                        headers["x-entry-frame-height"] = str(height)
                        if state.min_face_pixels is not None:
                            headers["x-entry-min-face-pixels"] = str(state.min_face_pixels)
                await send(message)
            await self.app(scope, receive, timed_send)
