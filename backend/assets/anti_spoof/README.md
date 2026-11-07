# Photo/screen presentation detection

These are ONNX exports of Minivision's **MiniFASNetV2** (2.7x context)
and **MiniFASNetV1SE** (4.0x context). Upstream repository:
https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
Revision: `b6d5f04ad78778917853b25c778acef6d5626d15`.
Copyright 2020 Minivision; Apache-2.0 license included in `LICENSE`.
`services/anti_spoof_service.py` adapts upstream contextual cropping and
classification. The upstream architectures are unchanged; weights were exported
to ONNX opset 11 for OpenCV DNN CPU inference (no runtime PyTorch/downloads).

| Artifact | SHA-256 |
| --- | --- |
| 2.7_80x80_MiniFASNetV2.onnx | b813eb6dac6b7f597063ce1c62a8d6be87ccc6f48acc8c5e3216d2b46d82ae6d |
| 4_0_0_80x80_MiniFASNetV1SE.onnx | a29cba82797e6717b8178d326ca4d34bcf1cf8c57cc0806c9567850d79b76068 |
| upstream 2.7_80x80_MiniFASNetV2.pth | a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0 |
| upstream 4_0_0_80x80_MiniFASNetV1SE.pth | 84ee1d37d96894d5e82de5a57df044ef80a58be2b218b5ed7cdfd875ec2f5990 |

Export validation used PyTorch 2.14.1+cpu, ONNX 1.23.2, static input
`[1,3,80,80]`, `conv6_kernel=(5,5)`, eval mode, legacy exporter (`dynamo=False`),
and `torch.load(..., weights_only=True, map_location='cpu')`.
The OpenCV and PyTorch logits differed by at most 1.91e-6 on a fixed random input.
Model checksums are verified at lazy load, and inference is locked across threads.

## Enforcement

- Input is BGR float32, range **0..255**; do not normalize to 0..1 or swap channels.
- Average the two softmax vectors; class **1** is the live class.
- Accept only with average live score >=0.90 and both models choosing class 1.
- Scores <0.50 are spoof results; intermediate/disagreeing results are uncertain.
  These are initial conservative thresholds, not calibrated probabilities.
- Every face used for recognition must pass, including faces missed by the Haar
  precheck. A mixed genuine/spoof group frame is rejected before matching or entry
  recording. Faces smaller than 80 pixels require moving closer.
- Missing/corrupt models or inference failures return unavailable, never a pass.
- Applies to face login, kiosk entry, librarian face lookup, and both enrollment
  routes. Password login and supervised manual-ID workflows remain available.
- Models are application assets, not account data. No library face samples are
  included here. No database migration or cloud configuration is needed.

## Reference validation

The optional real-model tests use upstream `images/sample/image_F1.jpg`,
`image_F2.jpg` (spoofs), and `image_T1.jpg` (genuine capture). Download those
three files from the pinned revision above into a local folder and set
`PAD_REFERENCE_DIR` to its absolute path. From the repository root run:

```powershell
$env:PAD_REFERENCE_DIR = 'C:/path/to/reference-samples'
python -m pytest backend/tests/test_anti_spoof.py -q -p no:cacheprovider
```

Tests verify both the frame precheck and the exact recognition boxes using the
bundled models, on original and JPEG-quality 65/90 versions. Additional API tests
cover denied cookies/tokens/access/enrollment, mixed group frames, unavailable
models, corrupt assets, and invalid geometry. Other recognition tests explicitly
mock PAD to keep testing their original recognition/authentication behavior.

The original references also exercise real detection, matching, and PAD together
through face login, kiosk entry, librarian lookup, and both enrollment routes.
An exact identity match from a spoof reference still cannot authorize access.
These use isolated test accounts and databases, never production accounts.

## Acceptance and limits

Reference samples are smoke tests, not an independent benchmark. On November 7,
2026 the operator reported 40/40 live-face and phone-screen trials passing in the
tested lighting, at near/normal distances and low/high quality. These are
user-reported results; camera model and per-condition measurements were not supplied.

The operator explicitly waived printed-photo testing and authorized release on
November 7, 2026. PAD implementation is complete for this release. Printed-photo
resistance is unverified, not a passed test or certified acceptance result.
Do not lower thresholds or relabel the waiver as testing evidence. The October 13
camera attempt produced retry results with a malfunctioning camera and is not
acceptance evidence. Future camera/lighting changes merit renewed field checks.

Passive RGB classification is not proof of camera origin. A digitally injected
genuine frame, sophisticated replay, video/deepfake, or unseen attack may pass.
This is not certified PAD and does not guarantee prevention of every photo attack.
High-assurance authentication additionally needs trusted capture, challenge-based
liveness/depth sensing, or a second authentication factor. The operator-authorized release accepts the untested printed-photo limitation.
