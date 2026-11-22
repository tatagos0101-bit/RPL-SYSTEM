"""Synthetic decode/PAD timing only; no camera, patrons, network or database."""
import argparse
from contextlib import nullcontext
import io
import base64
import json
import os
from pathlib import Path
import statistics
import sys
from time import perf_counter


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=Path(__file__).resolve().parents[1] / "backend")
    parser.add_argument("--samples", type=int, default=12)
    args = parser.parse_args()
    if not 1 <= args.samples <= 1000:
        parser.error("samples must be between 1 and 1000")
    if not (args.backend / "services" / "face_service.py").is_file():
        parser.error("backend must name a source checkout with the face service")
    # Never inherit a live persistence target. This process performs no DB work.
    os.environ.update(DATABASE_URL="sqlite+pysqlite://", ENVIRONMENT="test",
                      STORAGE_BACKEND="local", JWT_SECRET_KEY="synthetic-benchmark-key-not-for-authentication")
    sys.path.insert(0, str(args.backend.resolve()))
    import numpy as np
    from PIL import Image
    from services import face_service, liveness_service, anti_spoof_service as pad
    try:
        from services.face_frame import frame_scope
    except ModuleNotFoundError as exc:
        if exc.name != "services.face_frame":
            raise
        frame_scope = nullcontext

    pixels = np.full((480, 640, 3), 150, dtype=np.uint8)
    pixels[:, :, 0] = np.arange(640, dtype=np.uint16)[None, :] % 150 + 60
    output = io.BytesIO()
    Image.fromarray(pixels).save(output, format="JPEG", quality=85)
    image = "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode()

    def run():
        with frame_scope():
            face_service._decode_base64_image(image)
            bgr = liveness_service._decode_base64_image(image)
            pad.score_face(bgr, (192, 144, 256, 192))
            bgr = liveness_service._decode_base64_image(image)
            pad.score_face(bgr, (192, 144, 256, 192))

    for _ in range(3):
        run()
    times = []
    for _ in range(args.samples):
        started = perf_counter()
        run()
        times.append((perf_counter() - started) * 1000)
    print(json.dumps({"benchmark": "synthetic repeated decode and identical PAD tensors",
                      "request_scope": frame_scope is not nullcontext, "samples": len(times),
                      "median_ms": round(statistics.median(times), 2),
                      "min_ms": round(min(times), 2), "max_ms": round(max(times), 2),
                      "excludes": "face detection, identity matching, camera, network and database"}))


if __name__ == "__main__":
    main()
