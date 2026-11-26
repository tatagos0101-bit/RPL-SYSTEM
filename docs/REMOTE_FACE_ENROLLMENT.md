# Librarian ID verification and online face enrollment

Account creation remains an attended library-desk process. A public `/register`
submission produces a pending application receipt, not an active account.
**Register applicant in person** uses the same required-ID registration form.
The November 26 online enrollment policy is separate from that staff ID check.

## Librarian registration and ID review

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

Staff can use **Registered Users -> Actions -> Verify ID** to record an original-ID
check for an existing account. It requires the member's presence, staff attestation,
the bound ID review and the librarian's password. It does not change the member's
verified name or enroll a facial template. A legacy upload or display badge alone
is not verified identity. Online face enrollment no longer requires this action.

## Member enrollment from home

1. Sign in and complete any required first-login password/privacy setup.
2. Open **Profile -> Enroll face online**, **Update face online**, or the optional
   `/user/face-setup` step offered after first-login setup.
3. Read the separate facial-recognition terms, even after agreeing to membership
   terms. Select **Agree and start camera**. Cancel leaves the camera off.
4. Capture your own live face in even lighting, then select **Enroll** or
   **Update face**. No ID upload or face-to-ID comparison is requested.
5. On confirmed success, the page shows the enrolled account name. Password
   access remains available if enrollment fails or the member chooses to skip it.

The server requires the current consent version (`2026-11-26`) on every request,
an active authenticated session, completed account setup, exactly one detected face,
existing PAD checks and duplicate-face checks. Failed, uncertain or unavailable PAD
never saves or replaces a template. Member-supplied account IDs and identity flags
cannot select another account or change the librarian's ID verification.

Online enrollment is account-bound, not proof that a face matches a government ID.
A signed-in person must enroll their own face. The old read-only registered-face
verification operation is no longer selected; a successful update replaces the
current account's templates. Login, entrance, PAD and deduplication thresholds are
unchanged. The SFace ID-comparison limit was not loosened and no longer gates online
enrollment. Enrollment never issues a new login token or station credential.

## Stored information and privacy choices

A successful enrollment stores the encrypted facial template and consent version,
time, method (`self`) and account actor. InsightFace templates retain `remote_self`
provenance and dlib compatibility where available. Updating removes the previous
engine templates and clears `face_id_verified_at`, so an older ID comparison is not
misrepresented as verification of the new face. The original private ID, its staff
verification, member name and contact verification are preserved.

Live online enrollment frames are processed in memory and not saved to Storage,
security-alert snapshots or browser persistence, including failed attempts. The
modal clears captured previews after submission and releases camera tracks on
capture, close and page hiding. Resuming after hiding requires a fresh agreement.
Other supervised/security workflows retain their existing image policies.

Members may skip facial recognition and use passwords and supervised identification.
They can ask staff to remove their enrolled templates. Removing a template does not
close the account or erase borrowing history. No new retention schedule or automatic
biometric purge is introduced. Existing consent records are not backfilled or
retroactively changed; new enrollment and replacement require fresh agreement.

## Checks and limits

Librarian ID inspection uses the existing pinned local OCR, document suitability and
portrait checks, with supervised password-confirmed text review when permitted.
These checks do not authenticate documents with an issuing authority or guarantee
that a counterfeit ID is genuine. No external identity-verification service was added.

This revision needs no new database migration, dependency, model or environment
variable. Keep production `AUTO_MIGRATE=false`, private Storage, encryption keys,
RLS and revoked browser-role table access. Synthetic tests cover authentication,
consent, owner binding, PAD failures, deduplication, ID preservation and replacement.
Mocked-camera browser checks cover consent, camera cleanup and enrollment feedback.
These checks do not measure real-camera recognition accuracy or establish legal
compliance. Consenting physical-camera acceptance remains necessary.
