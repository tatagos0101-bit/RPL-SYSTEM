# Entrance face detector

OpenCV Zoo's YuNet `face_detection_yunet_2023mar.onnx`, MIT licensed by
Shiqi Yu; see `LICENSE`. Pinned upstream revision:
`48b10fa505aeb51fbd127fc60a5c660040e823b7`.

Source: https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet

SHA-256: `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`
(232,589 bytes). Verified against the upstream Git LFS pointer on download and
again at lazy load. No runtime download or new Python dependency is needed.
This 2023 model supports the project's OpenCV 4.x DNN runtime; the newer
OpenCV 5.x ONNX Runtime export is intentionally not used.

Only `/api/kiosk/face` uses these proposals. Detection runs at up to 960 pixels
on the longest edge and maps boxes back to the original captured pixels.
All proposals pass the existing brightness/PAD precheck before the bounded
recognition subset is encoded with dlib. The exact recognition boxes are still
checked independently; matching thresholds, margins and enrollment compatibility
are unchanged. Model failures fail closed. No identity is inferred by YuNet.

The detector and OpenCV mutable input size are locked during inference. Only
proposal coordinates are reused within the exact same request/image; the request
clears images, proposals and predictions at completion. Numeric frame dimensions,
minimum face size and processing durations support camera checks without storing
frames or identities in diagnostics.

Detection tests and public model-reference checks are not real-camera accuracy,
three-metre performance, or PAD certification. Camera detail, lighting, motion and
existing PAD limits still determine usable capture distance.
