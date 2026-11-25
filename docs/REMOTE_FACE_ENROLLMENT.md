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
portrait and live face using the existing engine and strict login threshold.
There is no threshold reduction or manual success fallback. Missing, mismatched,
uncertain or unavailable checks cannot enroll a face. The member cannot replace
their verified identity with a new upload.

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
unsupported layouts, unusable portraits and ambiguous multi-portrait documents
require desk assistance. Explicit specimen/invalid markings and readable expired
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
