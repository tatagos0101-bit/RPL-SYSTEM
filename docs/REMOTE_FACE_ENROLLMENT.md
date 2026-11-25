# Required member ID and online face enrollment

Account creation is an attended library-desk process. A public `/register`
submission produces a pending application receipt only. It cannot issue an active
account. In `/librarian/applications`, **Register applicant in person** opens the
same required-ID form used by **Registered Users → Register Member**.

## Librarian registration

1. Check that the applicant is present with an original, valid government photo ID.
2. Upload its front as JPG, PNG or WEBP (up to 10 MB and 16 megapixels).
3. Select **Check ID and read details**. Local OCR checks readable identifying
   text and a supported document type; face detection checks the portrait.
   If text reading fails, **Review original ID manually** lets a librarian select
   the government ID type and confirm their password. **Check portrait for manual
   review** still requires one usable portrait; it does not approve enrollment.
4. Review/correct the suggested name and address. Check the original document's
   expiry and security features and visually compare the person with its portrait.
5. Confirm that inspection and create the account. The ID is required on the
   server too; skipping the check, changing the file or reusing another
   librarian's check cannot bypass it. Checks expire after 15 minutes.

The original ID stays in the existing private `ids` category. The record stores
its digest, detected type, verification time and librarian ID. An identical ID
upload cannot be linked to two accounts; this is file deduplication, not an
issuer-level identity-number check. No ID number or date of birth is copied into
separate member fields. Entered contact details remain unverified.

Manual text review is a supervised alternative, not an automated authenticity
pass. Staff enter/review the name and address themselves and must still attest to
inspecting the original with the applicant present. The saved type uses a
`manual_` prefix (for example, `manual_tin_id`) to preserve review provenance
alongside the verifying librarian and time. The signed check remains bound to
that librarian and exact upload and expires after 15 minutes. Readable invalid or
specimen markings, expired dates and recognized tax documents cannot be
overridden. Unusable/multiple portraits and unavailable portrait detection still
block verification. An OCR outage alone can use the same supervised path.

An existing member without verification metadata needs **Registered Users →
Actions → Verify ID for online enrollment**. This requires the member's presence,
an ID check, librarian attestation and the librarian's password. A legacy upload
or display-only enrollment badge does not count as verified identity. This action
does not alter the member's verified name or enroll a facial template. Correcting
an already-verified identity requires administrator review; this UI does not
replace a verified baseline.

## Member enrollment from home

After completing first-login password setup, an eligible member opens **Profile
→ Enroll face online** (or **Update face online**). They supply a photo ID, read
and accept the separate face-recognition notice, open the camera, capture one
live face and confirm enrollment.

The server requires an active authenticated account, the current consent version
and a librarian-verified ID. It enforces the existing liveness/PAD checks and
enrollment deduplication. It compares the uploaded ID portrait, saved verified ID
portrait and live face using one local SFace verifier. Existing dlib/optional
InsightFace detection, live PAD and stored sign-in templates remain unchanged.
Small original uploads (at most 1600px on the longest edge and 1.1 MB) are sent
without another JPEG conversion. Larger photos are bounded to 1600px and the
request limit. The server makes its ID working frame lossless in memory.
Online camera capture requests 1280 by 960 pixels when supported; it keeps the
live image unmirrored while mirroring only its preview.

Comparison uses bounded, padded crops of the already-detected portraits and
consistent BGR input. The bundled YuNet detector supplies five landmarks and must
find exactly one face bound to the original detection. SFace aligns and encodes
all three portraits with the same model. Close-up portraits are downscaled only
for landmark detection to fit YuNet's supported face-size range, with stride
padding and landmarks mapped back for alignment on the original crop pixels.
Portraits below 64 pixels on either
face-box edge are rejected
with a quality message rather than treated as a different identity. These extra
descriptors are request-local comparison data only. Successful enrollment still
stores the original live-camera descriptor for existing sign-in compatibility.
The new verifier is separate from dlib: its 128D descriptors are never treated as
legacy dlib encodings or persisted as sign-in templates. It applies the existing
cosine login distance policy, capped at OpenCV's published reference limit; with
the default policy, similarity must be greater than 0.55. No configured login
threshold is reduced. See the [model provenance, safeguards and acceptance
limits](../backend/assets/identity_face/README.md). Missing/corrupt verifier models
or uncertain detections cannot silently fall back to a pass.
The extra comparison work does not change entrance/login processing or apply
image enhancement to PAD. PAD checks the original live capture before comparison.
There is no manual success fallback. Missing, mismatched,
uncertain or unavailable checks cannot enroll a face. The member cannot replace
their verified identity with a new upload.

Errors distinguish an uploaded-to-saved-ID mismatch, live-to-saved-ID mismatch
and live-to-uploaded-ID mismatch, with advice for the failing capture. Responses
never return descriptors or saved-ID images. Only after authenticated, live-PAD
and matching-original-ID checks can a failed live comparison return a text-only diagnostic with rounded
cosine distances, the applied limit and numeric crop-quality measurements.
Live landmark-detection failures also include a fixed issue code (no face,
multiple faces or unusable alignment) after the same original-ID/PAD gates;
no uncomputed live comparison score is invented. The
member can explicitly copy its allowlisted fields using **Copy support details**.
The report excludes identity/contact fields, ID references/digests, images and
templates; it is not logged, persisted or automatically sent to support. It is
cleared on a new attempt/file or closing the dialog. These processing
changes do not establish actual TIN-card or real-camera accuracy; operational
acceptance still requires consenting trials under library conditions.

For an original ID that a librarian manually verified, unreadable comparison text
can use that stored review provenance. This exception comes only from the saved
account record; members cannot enable it with a request flag. Detected invalid or
expired evidence still blocks it. A usable uploaded portrait, the unchanged
verified-original digest, all three face comparisons, live PAD and enrollment
deduplication remain mandatory. A manually reviewed ID never bypasses a failed,
uncertain or unavailable face/PAD check.

Remote comparison images are processed in memory and discarded after each check,
including unsuccessful checks. They are not uploaded to Storage, attached to
spoof alerts, logged, or stored in browser persistence. A successful check stores
the existing encrypted facial template, consent metadata and verification time.
The original staff-verified ID remains private. The UI clears comparison previews
after submission and releases camera tracks on capture, close and page hiding.
Other existing supervised/security workflows retain their documented policies.

Face enrollment remains optional. Password sign-in and supervised identification
remain available. Staff can remove enrolled face data through the existing flow.
No new retention schedule or automatic biometric purge is introduced.

## Checks and limits

OCR uses pinned `tesserocr` 2.13.0 with the checksummed official Tesseract integer
LSTM text model in `backend/assets/id_ocr`. The reader loads lazily, serializes CPU
inference and clears image/output/adaptive state after each request. It does not
download at runtime. Identity documents are not sent to an external OCR
or identity-verification service. The existing Docker and Vercel manifests include
this dependency and model directory; install/sync from the updated manifest and
lockfile. The smaller text reader replaces the first oversized OCR deployment
package; it does not change the face or liveness engines.

Supported text checks cover Philippine National ID, physical/digital BIR TIN photo ID, driver's license, passport,
UMID, PRC, Postal, SSS, GSIS, voter, senior-citizen and PWD photo IDs. Poor text,
unsupported layouts require supervised original-ID review or a clearer photo.
Unusable portraits and ambiguous multi-portrait documents require desk assistance.
Explicit specimen/invalid markings and readable expired
ISO/month-name dates are rejected. Staff still inspect the actual document.

TIN recognition checks the BIR issuer, a TIN-card heading and a readable printed
number. Physical Form 1931 layouts and digital TIN IDs can have an unlabeled name;
only an unambiguous name is suggested automatically. Tax forms, receipts and
registration certificates do not qualify. A usable portrait is still required for
online face comparison. The tax number is not copied into separate member fields
or returned in the inspection response. These format checks do not query BIR/ORUS
or authenticate its QR code. See BIR [RMC 58-2023](https://bir-cdn.bir.gov.ph/local/pdf/RMC%20No.%2058-2023%20%281%29.pdf)
and the [RMC 120-2023 listing](https://www.bir.gov.ph/2023-Revenue-Memorandum-Circulars).

**These checks do not authenticate an ID with its issuing authority or guarantee
that an edited/counterfeit document is genuine.** OCR, document suitability, face
comparison and PAD are separate checks. Official authenticity verification needs
an issuing-authority integration or an evaluated identity-document verification
provider. No such service, certification or measured recognition accuracy is
claimed here. See [NIST's distinction between evidence validation and biometric
verification](https://pages.nist.gov/800-63-4/sp800-63a/proofing/).

## Upgrade and acceptance

The additive upgrade adds nullable `users.id_document_digest`, `id_document_type`,
`id_verified_at`, `id_verified_by_id`, `face_id_verified_at` and the unique
`uq_users_id_document_digest` index. Run the existing reviewed migration path on
an isolated database first. Existing ID uploads and facial templates are not
backfilled as verified. Production keeps `AUTO_MIGRATE=false`, private Storage,
RLS and revoked browser-role database access.

The facial-recognition and privacy notices are versioned `2026-11-25`. Existing
consent records are preserved; new enrollments require the new facial notice.
Existing sign-in/attendance templates continue working, subject to normal account
and consent rules. Test with synthetic documents/vectors only in automated tests.
Before operational acceptance, staff must trial actual supported ID formats and
consenting live captures under library lighting. Automated tests do not establish
issuer authenticity, PostgreSQL concurrency or real-camera recognition accuracy.
