# Local ID-to-live portrait comparison

These are unmodified OpenCV Zoo SFace (MobileFaceNet, int8) recognition and YuNet
five-landmark detection models, pinned to revision
`48b10fa505aeb51fbd127fc60a5c660040e823b7`:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| face_recognition_sface_2021dec_int8.onnx | 9,896,933 | 2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a |
| face_detection_yunet_2023mar.onnx | 232,589 | 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4 |

The hashes and sizes match the pinned upstream Git LFS pointers. The binaries
came from the corresponding `media.githubusercontent.com/media/opencv/opencv_zoo`
paths at that revision. SFace is Apache-2.0 (`LICENSE_SFACE`); YuNet is MIT
(`LICENSE_YUNET`). No library documents, portraits or facial templates belong here.

## Operation and limits

`services/id_face_verifier.py` verifies both hashes when creating a request-local
encoder. It uses the existing OpenCV 4.10 CPU runtime; no new Python package,
runtime download or external biometric service is used. The encoder is reused
only inside the current scan context and released at its end. Native output
buffers are copied before the next inference. There is no cross-request image
or descriptor cache and no diagnostic image output.

YuNet uses confidence >= 0.90 and requires exactly one face in the bounded
portrait crop. Its face must overlap and have its center inside the face already
detected by enrollment; the five landmarks must be finite, nondegenerate and
within the crop. SFace aligns that portrait and returns a finite, nonzero 128D
descriptor. Missing/corrupt models, uncertain faces and inference errors fail
closed; there is no silent switch to another verifier after a failure.

All three portrait comparisons use SFace. The cosine-distance limit is the
stricter of the existing cosine login policy and OpenCV's published SFace baseline
(`1 - 0.363`). With the current default policy, distance must be < 0.45, equivalent
to similarity > 0.55. This does not change a configured login threshold or reuse a
dlib Euclidean descriptor as an SFace vector. Similarity is not a calibrated
identity probability. Live PAD, ID binding/digest checks, duplicate enrollment,
account authorization and the original stored sign-in template remain unchanged.

Automated tests use synthetic pixels/vectors, verify native model loading and
blank-image rejection, and test mismatches, model failures, exact-face binding,
buffer copying and request cleanup. They do not measure real-person/ID accuracy,
false acceptance or false rejection. Consenting operational trials with actual
ID formats, ages, camera positions and lighting are required for acceptance.
No claim of issuer authenticity or biometric certification is made.

## Primary references

- [Pinned SFace model and license](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_recognition_sface)
- [Pinned YuNet model and license](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet)
- [OpenCV detection, alignment and recognition tutorial](https://docs.opencv.org/4.x/d0/dd4/tutorial_dnn_face.html)
