# Entrance station

The November 20 local revision keeps the camera visible while recognition feedback
appears below it and adds manual visitor attendance. This document describes the
source and local checks; it does not establish production deployment or camera accuracy.

## Operation

1. Open `/entry-station` and unlock it with the current station PIN.
2. Make the existing facial-processing notice visible and choose **Start camera**.
   Starting the camera is an operator action, not a patron consent record.
3. The scanner continues during low light, no-face and unrecognized-face results.
   Guidance appears below the preview; it does not replace or cover the video.
4. Existing group recognition processes multiple detected faces per frame, up to
   `ENTRY_MAX_FACES_PER_FRAME` (default four). Each eligible member receives their
   own attendance result. Presence tracking prevents repeated frames from toggling
   the same visit. Failed or uncertain PAD still rejects attendance for that frame.
5. For a new/unrecognized visitor, enter **Visitor name** and **Location** in
   **Manual visitor**, then choose **Record entry**. This stores a manual attendance
   visit with server-confirmed Philippine time-in; it does not enroll a face or
   create a borrowing account. The camera can continue during manual entry.
6. Choose **Record exit** on that exact open manual visit when the person leaves.
   **Open manual visits** provides search and paging across days, independently
   of the capped recent-attendance list.

Pause, page hiding, navigation and station-PIN rejection release the camera.
Ordinary recognition guidance does not pause it. No offline write is reported as
saved without server confirmation. After an uncertain manual-create response, keep
the submitted draft and retry the same request; do not submit a new visit to guess
whether the first succeeded. Repeating an exit preserves its original timestamp.

## API and storage

Kiosk reads and writes verify `X-Entry-Station-Pin` for every request. Scans use the
existing PIN body field. Rejected PIN attempts are rate-limited. These operations
do not issue account tokens/cookies or bypass server recognition/PAD policies.

- `POST /api/kiosk/manual-entries`: UUID4 `request_id`, trimmed `visitor_name`
  (1–150 characters) and `visitor_location` (1–200). Replaying the same normalized
  UUID/draft returns the original visit; conflicting reuse returns409.
- `POST /api/kiosk/manual-entries/{id}/exit`: closes only an eligible manual guest
  entry. Face/member entries and legacy manual rows without request metadata are
  ineligible. The exact time-in is preserved, and time-out is written once.
- `POST /api/kiosk/manual-entries/search`: body `{open_only,search,skip,limit}`;
  returns `{items,total}`. Search text is kept out of request URLs/access logs.
- `GET /api/kiosk/manual-entries`: non-search pagination and open-visit filter.
- Existing PIN-protected recent logs and librarian-authorized entry logs include
  optional visitor fields. Names/locations are attendance data, not verified identity.

The additive upgrade adds nullable `entry_logs.visitor_name`, `visitor_location`
and `manual_request_id`, plus partial unique index
`uq_entry_logs_manual_request_id`. Existing attendance rows remain intact. Use
the established migration path on an explicitly selected database; do not regenerate
or replay initial SQL. Apply the upgrade before deploying the updated API. Production
`AUTO_MIGRATE=false` remains required; no production migration is authorized here.

## Checks and limits

Schema tests cover existing rows, repeated SQLite upgrades, request-ID uniqueness
and PostgreSQL DDL compilation. API tests use isolated synthetic fixtures for PIN
checks/rate limits, validation, retries, exact exits, search and pagination. Existing
multi-face, presence and PAD tests remain relevant. Synthetic browser checks verify
camera continuity and manual entry; they do not certify real-face/PAD accuracy or
live PostgreSQL concurrency. The existing privacy/retention policy is unchanged.
