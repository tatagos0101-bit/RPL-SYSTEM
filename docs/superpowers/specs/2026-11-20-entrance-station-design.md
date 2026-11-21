# Entrance station: continuous preview and manual visitors

## Authorized requirements

- Redesign the entrance station in the existing walnut, warm-paper and amber theme.
- Keep the camera preview running and unobscured during darkness, no-face,
  unrecognized-face and recognition-service guidance. Display guidance below it.
- Retain group recognition and individual attendance records for multiple faces.
- Add manual visitor name and location entry for new/unrecognized visitors.
- The user explicitly selected manual time-in and time-out, including a staff
  **Record exit** action.

## Current implementation

`frontend/src/pages/lib/EntryGate.jsx` already polls the PIN-protected kiosk API,
tracks visible member IDs and shows per-face boxes. Full-screen result layers
obscure its preview. `backend/routers/auth.py:process_entry_face` already supports
group frames; the configured default cap is four. Do not weaken PAD or matching.
`EntryLog` supports nullable-user manual records but has no visitor fields or
manual-write endpoint. The current station trust boundary is its per-request PIN.

## Visual and interaction design

- A simple branded header, Philippine clock, connection state and pause control.
- Wide camera-led workspace with a 4:3 preview so normalized boxes remain aligned.
- Status guidance and compact individual recognition results below the preview.
- A companion panel for manual visitor entry and recent attendance.
- Manual form use and saving must not unmount or replace the camera.
- Names, locations and timestamps in the log; exit action only for open manual
  visitor records. Label these records as manual rather than verified members.
- Keep PIN unlock, the privacy notice and the explicit initial camera-start action.
- Preserve camera release on pause, page hiding, navigation, camera failure and
  station-PIN rejection. Darkness and recognition misses do not release it.
- Preserve sequential scan requests, request backoff, presence tracking and the
  existing entrance-versus-login distinction. Never report an offline write saved.

## Storage and API contract

Add nullable `EntryLog.visitor_name` (VARCHAR150), `visitor_location` (VARCHAR200)
and `manual_request_id` (VARCHAR36) with a unique index. Use the additive upgrade
path and preserve all existing rows; no production migrations are authorized.

- `POST /api/kiosk/manual-entries`, header `X-Entry-Station-Pin`, body
  `{request_id: UUID4, visitor_name: string, visitor_location: string}`.
  Trim and validate nonempty inputs without restricting legitimate Unicode names.
  Create a granted manual guest entry (`user_id=null`) with `now_ph()` time-in.
  Repeated UUID plus the same normalized payload returns the original entry;
  mismatched reuse returns409. Concurrency relies on the unique index, not names.
- `POST /api/kiosk/manual-entries/{id}/exit`, the same PIN header.
  Close only a granted manual guest entry. Lock the exact record, preserve its
  time-in and return an already-recorded time-out unchanged on retry.
- Return `EntryLogOut` with optional visitor-name/location fields. Existing face
  records retain their shape; member-name display can fall back to visitor name.
- PIN verification occurs on every read/write. No account, biometric template,
  authentication cookie or login token is created for a manual visitor.

## Implementation ownership

1. Schema agent: EntryLog model, additive migration/index and migration tests.
2. Backend agent: kiosk routes, manual-entry service, schemas, log serialization
   and backend API tests. No schema-agent files.
3. Controller: entrance UI, dedicated styles/components, frontend helpers/API,
   browser tests, documentation, local startup and integration review.

All work preserves the existing uncommitted catalog/borrowing changes. No Git
commit, push, cloud mutation, new dependency or real-patron fixture is authorized.

## Acceptance evidence

- Migration repeat execution preserves legacy data and creates the unique index.
- PIN absence/wrong PIN, input bounds, idempotent create/race behavior, exact
  manual exit and time preservation are covered by isolated backend tests.
- Existing group recognition, presence rearming, no-kiosk-token and PAD checks pass.
- Synthetic desktop/mobile browser checks show continued video during lighting,
  no-face/unknown responses, group results and manual-form submission; camera
  release and late-result suppression are verified on pause/hide/navigation.
- Builds, lint and relevant helper/regression suites pass. Real-camera accuracy,
  live PostgreSQL concurrency and production deployment remain unverified unless
  separately exercised and explicitly reported.
