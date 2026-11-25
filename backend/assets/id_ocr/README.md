# Local ID text reader

`eng.traineddata` is the official Tesseract `tessdata_fast` integer LSTM English
model, pinned to commit `87416418657359cb625c412a48b6e1d6d41c29bd`.
Source: <https://github.com/tesseract-ocr/tessdata_fast>.
SHA-256: `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`.
See the included `LICENSE` and `SOURCE.txt`.

The pinned `tesserocr` wheel supplies the native Tesseract/Leptonica runtime on
supported Python 3.11/3.12 Windows and manylinux targets. There is no separate
system executable, model download or external OCR request at runtime.
The Vercel function explicitly includes this directory. Docker copies it with
the backend source.

The service checks the model checksum, serializes access, and clears the image,
recognition output and adaptive state after every request. OCR only proposes
name/address fields and supports document suitability checks. It does not
authenticate the issuer or certify a document genuine. Existing face comparison,
enrollment deduplication and PAD models/thresholds are unchanged.
