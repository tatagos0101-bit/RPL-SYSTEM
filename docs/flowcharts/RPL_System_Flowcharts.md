# Updated Rizal Provincial Library System Flowcharts

Edition: 17 November 2026

Current application source and existing regression coverage. These diagrams document implemented workflows; they do not certify every production integration.

The original sections 2.3.1-2.3.9 are retained; 2.3.7 is split into borrowing and returning. Additional workflows continue through 2.3.28.

These are documentation artifacts. No application behavior, database or account data is changed.

## 2.3.1 Login and Role Routing

Shows password or Face ID sign-in, account checks, first-login password replacement, and routing to the stored member or librarian role.

```mermaid
flowchart TD
  n_s(["Start"])
  n_portal["Open member or librarian sign-in"]
  n_registered{"Account already registered?"}
  n_reg[["Visit librarian for registration (2.3.10)"]]
  n_method{"Choose sign-in method"}
  n_password[/"Enter email or Member ID and password"/]
  n_camera[/"Capture one live face; run PAD and enrolled-face matching"/]
  n_account{"Identity, active account and portal role accepted?"}
  n_fail["Show error; retry or use password / supervised assistance"]
  n_session["Create authenticated session"]
  n_required{"Password replacement required?"}
  n_change[["Change password (2.3.12)"]]
  n_role{"Stored account role?"}
  n_member["Open member dashboard or permitted next page"]
  n_staff["Open librarian dashboard or permitted next page"]
  n_e(["End"])
  n_s --> n_portal
  n_portal --> n_registered
  n_registered -->|"No"| n_reg
  n_reg -.->|"After registration"| n_portal
  n_registered -->|"Yes"| n_method
  n_method -->|"Password"| n_password
  n_method -->|"Face ID"| n_camera
  n_password --> n_account
  n_camera --> n_account
  n_account -->|"No / uncertain"| n_fail
  n_fail -.->|"Retry / choose Password"| n_method
  n_account -->|"Yes"| n_session
  n_session --> n_required
  n_required -->|"Yes"| n_change
  n_required -->|"No"| n_role
  n_change -->|"After successful change"| n_role
  n_role -->|"Member"| n_member
  n_role -->|"Librarian"| n_staff
  n_member --> n_e
  n_staff --> n_e
```

- Public catalog browsing requires no account. The current website registers members through librarians; it has no public registration form.
- Face ID is optional and requires existing enrollment. Failed or unavailable live-face verification does not grant access.
- Member and librarian are the two stored roles. A website login does not record entrance attendance.

Implementation references:

- [frontend/src/pages/public/LoginPage.jsx](../../frontend/src/pages/public/LoginPage.jsx)
- [frontend/src/App.jsx](../../frontend/src/App.jsx)
- [backend/routers/auth.py](../../backend/routers/auth.py)
- [backend/tests/test_first_login_password.py](../../backend/tests/test_first_login_password.py)
- [backend/tests/test_repair_attendance.py](../../backend/tests/test_repair_attendance.py)

## 2.3.2 Borrower Navigation

Shows navigation among the member dashboard, book discovery, My Reservations, and Profile.

```mermaid
flowchart TD
  n_s(["Member signed in"])
  n_menu{"Choose member page"}
  n_home["Dashboard: loans, due notices, activity and goals"]
  n_browse[["Browse Books: shelves, search and favorites (2.3.3)"]]
  n_reservations[["My Reservations: selection, ready books and queue (2.3.4 / 2.3.15)"]]
  n_profile[["Profile: contact details, photo and security (2.3.13)"]]
  n_continue{"Sign out?"}
  n_logout["Revoke current session and clear browser sign-in"]
  n_end(["Return to public website"])
  n_s --> n_menu
  n_menu -->|"Dashboard"| n_home
  n_menu -->|"Browse Books"| n_browse
  n_menu -->|"My Reservations"| n_reservations
  n_menu -->|"Profile"| n_profile
  n_home --> n_continue
  n_browse --> n_continue
  n_reservations --> n_continue
  n_profile --> n_continue
  n_continue -.->|"No: use another page"| n_menu
  n_continue -->|"Yes"| n_logout
  n_logout --> n_end
```

- The reserved-count button in Browse Books opens My Reservations.
- Borrowers can report a loan issue from the dashboard; only librarians complete physical borrow and return transactions.

Implementation references:

- [frontend/src/App.jsx](../../frontend/src/App.jsx)
- [frontend/src/components/UserLayout.jsx](../../frontend/src/components/UserLayout.jsx)
- [frontend/src/pages/user/UserHome.jsx](../../frontend/src/pages/user/UserHome.jsx)
- [frontend/src/pages/user/UserBrowseBooks.jsx](../../frontend/src/pages/user/UserBrowseBooks.jsx)

## 2.3.3 Browse Books and Add to Reservation Cart

Shows public and member discovery, book details, and selection for later reservation confirmation.

```mermaid
flowchart TD
  n_s(["Open public catalog or member Browse Books"])
  n_find[/"Search title or author; choose genre, shelf or sort"/]
  n_results{"Matching books found?"}
  n_empty["Show empty results; adjust filters"]
  n_view[/"Open book details and availability"/]
  n_reserve{"Reserve this title?"}
  n_login{"Member signed in?"}
  n_signin[["Sign in; restore selected title (2.3.1)"]]
  n_eligible{"No duplicate and a slot remains?"}
  n_blocked["Show duplicate, capacity or pending-request message"]
  n_cart["Add title to local reservation selection"]
  n_more{"Select another title?"}
  n_checkout[["Open My Reservations (2.3.4)"]]
  n_e(["End"])
  n_s --> n_find
  n_find --> n_results
  n_results -->|"No"| n_empty
  n_empty -.->|"Try another search"| n_find
  n_results -->|"Yes"| n_view
  n_view --> n_reserve
  n_reserve -->|"No"| n_more
  n_reserve -->|"Yes"| n_login
  n_login -->|"No"| n_signin
  n_signin -->|"After sign-in"| n_eligible
  n_login -->|"Yes"| n_eligible
  n_eligible -->|"Yes"| n_cart
  n_eligible -->|"No"| n_blocked
  n_blocked --> n_more
  n_cart --> n_more
  n_more -.->|"Yes"| n_find
  n_more -->|"No"| n_checkout
  n_checkout --> n_e
```

- Adding a selection does not hold stock, create a loan, or save a confirmed reservation.
- Landing-page searches open the public catalog and highlight matching title or author text. Member Featured shelves scroll sideways; the desktop public catalog uses a vertical grid.

Implementation references:

- [frontend/src/pages/public/PublicBrowse.jsx](../../frontend/src/pages/public/PublicBrowse.jsx)
- [frontend/src/pages/public/LandingPage.jsx](../../frontend/src/pages/public/LandingPage.jsx)
- [frontend/src/pages/user/UserBrowseBooks.jsx](../../frontend/src/pages/user/UserBrowseBooks.jsx)
- [frontend/src/api/reservationCart.js](../../frontend/src/api/reservationCart.js)

## 2.3.4 Reservation Checkout and Five-Book Limit

Shows authenticated batch confirmation, explicit queue agreement, the combined five-book allowance, and safe retry handling.

```mermaid
flowchart TD
  n_s(["Open My Reservations"])
  n_load["Load selection, existing reservations and remaining slots"]
  n_review[/"Review titles; remove unwanted selections"/]
  n_unavailable{"Any title unavailable?"}
  n_agree{"Agree to queue each unavailable title?"}
  n_confirm[/"Select Confirm Reservation"/]
  n_request["Save confirmation request ID and submit batch"]
  n_checks{"Server checks pass?"}
  n_reject["Show quota, overdue, duplicate or availability conflict"]
  n_unknown{"Outcome confirmed by server?"}
  n_retry["Keep original request; retry same confirmation safely"]
  n_saved["Save whole batch: ready or queued"]
  n_refresh["Clear selection; refresh reservations and slots"]
  n_e(["Confirmation complete"])
  n_s --> n_load
  n_load --> n_review
  n_review --> n_unavailable
  n_unavailable -->|"Yes"| n_agree
  n_unavailable -->|"No"| n_confirm
  n_agree -->|"Yes"| n_confirm
  n_agree -.->|"No: revise selection"| n_review
  n_confirm --> n_request
  n_request --> n_checks
  n_checks -->|"Rejected"| n_reject
  n_reject -.->|"Correct and review"| n_review
  n_checks -->|"No rejection received"| n_unknown
  n_unknown -->|"Unknown / interrupted"| n_retry
  n_retry -.->|"Same request ID"| n_request
  n_unknown -->|"Success"| n_saved
  n_saved --> n_refresh
  n_refresh --> n_e
```

- The current confirmation endpoint does not request a face scan. At physical pickup, librarians identify the member by Face ID or supervised manual ID.
- Five-book limit = active/overdue loans + ready reservations + queued reservations + new selections. The server rechecks the limit and eligibility.
- Unavailable titles require explicit queue agreement. Ready reservations have a 24-hour pickup deadline; no exact physical copy is allocated by reservation.

Implementation references:

- [frontend/src/pages/user/UserReservations.jsx](../../frontend/src/pages/user/UserReservations.jsx)
- [backend/routers/reservations.py](../../backend/routers/reservations.py)
- [backend/services/reservation_confirmation.py](../../backend/services/reservation_confirmation.py)
- [backend/services/borrowing_capacity.py](../../backend/services/borrowing_capacity.py)
- [backend/tests/test_reservation_policy.py](../../backend/tests/test_reservation_policy.py)

## 2.3.5 Staff Logging and Entrance Attendance

Shows PIN-controlled attendance scanning, live-face validation, and time-in/time-out for a distinct encounter.

```mermaid
flowchart TD
  n_s(["Open Entrance Station"])
  n_pin[/"Enter authorized station PIN"/]
  n_unlock{"PIN accepted?"}
  n_error["Show error; ask authorized librarian"]
  n_notice["Display privacy notice and start camera"]
  n_capture[/"Capture live face encounter"/]
  n_live{"Live-face check passes?"}
  n_match{"Recognized active enrolled account?"}
  n_denied["No successful attendance; show assistance message"]
  n_new{"New distinct encounter?"}
  n_ignore["Keep existing state; ignore repeated visible frames"]
  n_inside{"Open attendance session exists?"}
  n_out["Record time-out on existing visit"]
  n_in["Create new visit with time-in"]
  n_show["Show confirmed state and attendance log"]
  n_e(["Pause camera when finished"])
  n_s --> n_pin
  n_pin --> n_unlock
  n_unlock -->|"No"| n_error
  n_error -.->|"Retry"| n_pin
  n_unlock -->|"Yes"| n_notice
  n_notice --> n_capture
  n_capture --> n_live
  n_live -->|"Yes"| n_match
  n_live -->|"No / uncertain"| n_denied
  n_match -->|"Yes"| n_new
  n_match -->|"No"| n_denied
  n_new -->|"No"| n_ignore
  n_new -->|"Yes"| n_inside
  n_inside -->|"Yes"| n_out
  n_inside -->|"No"| n_in
  n_ignore --> n_show
  n_out --> n_show
  n_in --> n_show
  n_denied --> n_show
  n_show --> n_e
```

- This is entrance attendance for recognized enrolled accounts, not a separate payroll or staff scheduling module.
- The current station client debounces repeated frames and marks distinct encounters. Legacy clients retain the configured timing rules.
- Station PIN access does not issue account login cookies. Scanning pauses when the page is hidden, and failed connections are not saved for offline replay.

Implementation references:

- [frontend/src/pages/lib/EntryGate.jsx](../../frontend/src/pages/lib/EntryGate.jsx)
- [frontend/src/api/entryAttendance.js](../../frontend/src/api/entryAttendance.js)
- [backend/routers/kiosk.py](../../backend/routers/kiosk.py)
- [backend/services/entry_session_policy.py](../../backend/services/entry_session_policy.py)
- [backend/tests/test_entry_session_policy.py](../../backend/tests/test_entry_session_policy.py)

## 2.3.6 Add Book and QR Code Generation

Shows manual or ISBN-assisted book entry, optional descriptions, validation, physical-copy creation, and label preparation.

```mermaid
flowchart TD
  n_s(["Librarian opens Add Book"])
  n_method{"Entry method?"}
  n_lookup[/"Enter ISBN; request Auto Fill"/]
  n_manual[/"Enter book details manually"/]
  n_review[/"Review title, author, category, year, shelf and copy count"/]
  n_description[/"Optionally add online description or write a note"/]
  n_save[/"Select Add Book"/]
  n_valid{"Book values and uniqueness valid?"}
  n_error["Show errors; correct form"]
  n_create["Save title and create physical copies with unique QR codes"]
  n_cover["Upload optional cover; report cover-only failure separately"]
  n_labels[["Open Print QR; download exact-copy labels (2.3.23)"]]
  n_e(["Book appears in catalog"])
  n_s --> n_method
  n_method -->|"ISBN Auto Fill"| n_lookup
  n_method -->|"Manual"| n_manual
  n_lookup -->|"Review lookup result"| n_review
  n_manual --> n_review
  n_review --> n_description
  n_description --> n_save
  n_save --> n_valid
  n_valid -->|"No"| n_error
  n_error -.->|"Correct values"| n_review
  n_valid -->|"Yes"| n_create
  n_create --> n_cover
  n_cover --> n_labels
  n_labels --> n_e
```

- A description is optional, public catalog text. Manual descriptions are supported when no online description is available.
- Each physical copy receives its own identity. QR image download/reprinting does not create more copies.
- If the book saves but its cover fails, retry only the cover upload. Resolve an unknown save outcome before submitting another book.

Implementation references:

- [frontend/src/pages/lib/LibAddBook.jsx](../../frontend/src/pages/lib/LibAddBook.jsx)
- [frontend/src/components/BookDescriptionField.jsx](../../frontend/src/components/BookDescriptionField.jsx)
- [backend/routers/inventory.py](../../backend/routers/inventory.py)
- [backend/services/book_copy_service.py](../../backend/services/book_copy_service.py)
- [backend/tests/test_book_description.py](../../backend/tests/test_book_description.py)

## 2.3.7a Borrow Transaction

Shows member identification, automatic selection from ready reservations, optional scanning for walk-ins, and reviewed lending.

```mermaid
flowchart TD
  n_s(["Librarian selects Borrow"])
  n_identify[/"Identify member using Face ID or supervised manual ID"/]
  n_valid{"Member identified and eligible?"}
  n_assist["Resolve identity or account restriction"]
  n_load["Load member slots, ready reservations and queued requests"]
  n_ready{"Borrowing a ready reservation?"}
  n_reserved[/"Select Add to list; system chooses an available physical copy"/]
  n_walk[/"Scan QR or enter book code for walk-in / extra title"/]
  n_lookup{"Exact copy or legacy code?"}
  n_legacy[/"Explicitly choose copy when legacy code is ambiguous"/]
  n_review[/"Review titles, exact copies and due-date preview"/]
  n_confirm[/"Select Confirm Borrow"/]
  n_check{"All borrowing rules still pass?"}
  n_fail["Show rejected item; keep confirmed successes"]
  n_commit["Create loan; update copy and stock; fulfill applicable reservation"]
  n_outcome[["Handle each item and unknown outcomes (2.3.27)"]]
  n_e(["Show results; hand over confirmed copies"])
  n_s --> n_identify
  n_identify --> n_valid
  n_valid -->|"No"| n_assist
  n_assist -.->|"Retry"| n_identify
  n_valid -->|"Yes"| n_load
  n_load --> n_ready
  n_ready -->|"Yes"| n_reserved
  n_ready -->|"No / additional title"| n_walk
  n_reserved --> n_review
  n_walk --> n_lookup
  n_lookup -->|"Exact copy"| n_review
  n_lookup -->|"Legacy / ambiguous"| n_legacy
  n_legacy --> n_review
  n_review --> n_confirm
  n_confirm --> n_check
  n_check -->|"Rejected"| n_fail
  n_check -->|"Accepted"| n_commit
  n_commit --> n_outcome
  n_fail --> n_outcome
  n_outcome --> n_e
```

- Ready reservations use Add to list without mandatory QR scanning or code selection. Staff may change the copy before review and must hand over the copy shown. Queued requests are not ready loans.
- Selections and scans do not commit a loan. A ready reservation converts to a loan without consuming a second slot.
- Multi-book submissions are sequential independent requests. No silent copy substitution occurs if a selected copy becomes unavailable.
- Final server checks cover account status, overdue loans, the combined allowance, ready-hold capacity, duplicate title loans and exact-copy availability.

Implementation references:

- [frontend/src/components/CirculationDialog.jsx](../../frontend/src/components/CirculationDialog.jsx)
- [frontend/src/components/BorrowBookSelection.jsx](../../frontend/src/components/BorrowBookSelection.jsx)
- [frontend/src/components/CirculationMember.jsx](../../frontend/src/components/CirculationMember.jsx)
- [backend/routers/transactions.py](../../backend/routers/transactions.py)
- [backend/tests/test_circulation_atomicity.py](../../backend/tests/test_circulation_atomicity.py)

## 2.3.7b Return Transaction

Shows exact-copy lookup, explicit selection of ambiguous legacy loans, review, and updating the original loan.

```mermaid
flowchart TD
  n_s(["Librarian selects Return"])
  n_scan[/"Scan physical-copy QR or enter code"/]
  n_found{"Copy or legacy title found?"}
  n_error["Show invalid / missing code; correct entry"]
  n_loan{"One exact active loan identified?"}
  n_select[/"Choose the exact outstanding loan for a legacy code"/]
  n_list["Add original transaction and copy to return list"]
  n_review[/"Review borrower, title and physical copy"/]
  n_confirm[/"Select Confirm Return"/]
  n_validate{"Original loan and copy still valid?"}
  n_reject["Show rejection; do not mark returned"]
  n_commit["Update original loan to returned; preserve borrow date and copy ID"]
  n_stock["Restore available stock; assess late fine if applicable"]
  n_queue["Promote next eligible queued reservation"]
  n_result[["Handle per-item results and unknown outcomes (2.3.27)"]]
  n_e(["Display confirmed returns"])
  n_s --> n_scan
  n_scan --> n_found
  n_found -->|"No"| n_error
  n_error -.->|"Retry"| n_scan
  n_found -->|"Yes"| n_loan
  n_loan -->|"Yes"| n_list
  n_loan -->|"Ambiguous legacy lookup"| n_select
  n_select --> n_list
  n_list --> n_review
  n_review --> n_confirm
  n_confirm --> n_validate
  n_validate -->|"No"| n_reject
  n_validate -->|"Yes"| n_commit
  n_commit --> n_stock
  n_stock --> n_queue
  n_queue --> n_result
  n_reject --> n_result
  n_result --> n_e
```

- A return closes the original loan; it does not create an unrelated return row or erase borrowing history.
- Return mode starts with book lookup and can contain different borrowers. Members do not self-confirm physical returns.
- An assessed fine is not payment collection. The current interface hides fine panels.

Implementation references:

- [frontend/src/components/CirculationDialog.jsx](../../frontend/src/components/CirculationDialog.jsx)
- [backend/routers/transactions.py](../../backend/routers/transactions.py)
- [backend/services/reservation_policy.py](../../backend/services/reservation_policy.py)
- [backend/tests/test_circulation_scanning.py](../../backend/tests/test_circulation_scanning.py)

## 2.3.8 Report Generation

Shows authorized reporting, Philippine-time filters, paged previews, and validated exports or print output.

```mermaid
flowchart TD
  n_s(["Librarian opens Reports &amp; Analytics"])
  n_choose[/"Choose usage, patrons, circulation, collection, acquisitions or inventory"/]
  n_filters[/"Set date basis, Philippine dates and category filters"/]
  n_apply[/"Apply filters"/]
  n_valid{"Filters valid and query available?"}
  n_error["Show error or empty result; revise when needed"]
  n_query["Read authorized logs, transactions, member and inventory data"]
  n_preview["Build summaries, charts and paged records"]
  n_export{"Download or print?"}
  n_format[/"Choose scope and CSV, Excel, PDF or Print"/]
  n_check{"Preview current and export within limits?"}
  n_refresh["Refresh preview or narrow filters"]
  n_file["Generate safe output for selected scope"]
  n_e(["Review report"])
  n_s --> n_choose
  n_choose --> n_filters
  n_filters --> n_apply
  n_apply --> n_valid
  n_valid -->|"Invalid / unavailable"| n_error
  n_error -.->|"Revise / retry"| n_filters
  n_valid -->|"Yes; zero rows allowed"| n_query
  n_query --> n_preview
  n_preview --> n_export
  n_export -->|"Preview only"| n_e
  n_export -->|"Yes"| n_format
  n_format --> n_check
  n_check -->|"No"| n_refresh
  n_refresh -.->|"Apply again"| n_apply
  n_check -->|"Yes"| n_file
  n_file --> n_e
```

- Monthly PDF uses its own Month and Year controls. Report previews and exports preserve applied filters, not unsaved draft changes.
- Period circulation counts use borrow dates including returned loans. Current overdue and stock figures are snapshots. Export scope and row limits must be checked.
- Reports are librarian-only. Acquisition reporting needs its separate schema upgrade; these diagrams do not establish that every production prerequisite is complete.

Implementation references:

- [frontend/src/pages/lib/LibReports.jsx](../../frontend/src/pages/lib/LibReports.jsx)
- [backend/routers/reporting.py](../../backend/routers/reporting.py)
- [backend/routers/reports.py](../../backend/routers/reports.py)
- [backend/services/reporting.py](../../backend/services/reporting.py)
- [backend/tests/test_reporting_center.py](../../backend/tests/test_reporting_center.py)

## 2.3.9 Due Books Monitoring

Shows refresh-time overdue evaluation, due-date filtering, librarian review, and the link to physical return processing.

```mermaid
flowchart TD
  n_s(["Librarian opens Due Books"])
  n_sync["Refresh outstanding loans; synchronize overdue status"]
  n_filter[/"Choose All, Overdue or Due Soon"/]
  n_classify{"Due date has passed?"}
  n_overdue["Show overdue status, days late and assessed amount"]
  n_soon{"Due within next three days?"}
  n_near["Show Due Soon"]
  n_other["Include according to chosen scope"]
  n_list["Display borrower, title, copy and due date"]
  n_act{"Physical book returned at counter?"}
  n_return[["Process confirmed return (2.3.7b)"]]
  n_monitor["Continue monitoring or contact member through approved process"]
  n_e(["Refresh list after changes"])
  n_s --> n_sync
  n_sync --> n_filter
  n_filter --> n_classify
  n_classify -->|"Yes"| n_overdue
  n_classify -->|"No"| n_soon
  n_soon -->|"Yes"| n_near
  n_soon -->|"No"| n_other
  n_overdue --> n_list
  n_near --> n_list
  n_other --> n_list
  n_list --> n_act
  n_act -->|"Yes"| n_return
  n_act -->|"No"| n_monitor
  n_return --> n_e
  n_monitor --> n_e
```

- Due Soon is the next three days. The default All due-book query includes overdue loans and loans due within seven days; broader loan records are separate.
- Overdue loans can prevent new borrowing. Email/SMS overdue reminders are currently unavailable, so this chart does not claim automatic message delivery.

Implementation references:

- [frontend/src/pages/lib/LibDueBooks.jsx](../../frontend/src/pages/lib/LibDueBooks.jsx)
- [backend/routers/librarian.py](../../backend/routers/librarian.py)
- [backend/services/loan_policy.py](../../backend/services/loan_policy.py)
- [backend/tests/test_overdue_policy.py](../../backend/tests/test_overdue_policy.py)

## 2.3.10 Member Registration and Temporary Password Delivery

Shows librarian registration with optional identification uploads, email-first credential delivery, and supervised fallback.

```mermaid
flowchart TD
  n_s(["Librarian selects Register Member"])
  n_input[/"Enter verified name; optional email, phone, location and ID upload"/]
  n_valid{"Required fields, contacts and optional upload valid?"}
  n_error["Correct validation or duplicate-email error"]
  n_create["Create Member ID; hash 10-character temporary password; require replacement"]
  n_email{"Email address provided?"}
  n_sendemail["Attempt configured email delivery"]
  n_phone{"Phone provided without email?"}
  n_sendsms["Attempt configured registration SMS delivery"]
  n_accepted{"Provider accepts delivery?"}
  n_private["Do not display temporary password to librarian"]
  n_handoff["Display same temporary password for private librarian handoff"]
  n_login[["Member signs in and changes password (2.3.1 / 2.3.12)"]]
  n_e(["Registration complete"])
  n_s --> n_input
  n_input --> n_valid
  n_valid -->|"No"| n_error
  n_error -.->|"Correct fields"| n_input
  n_valid -->|"Yes"| n_create
  n_create --> n_email
  n_email -->|"Yes"| n_sendemail
  n_email -->|"No"| n_phone
  n_phone -->|"Yes"| n_sendsms
  n_phone -->|"No"| n_handoff
  n_sendemail --> n_accepted
  n_sendsms --> n_accepted
  n_accepted -->|"Yes"| n_private
  n_accepted -->|"Unavailable / failed"| n_handoff
  n_private --> n_login
  n_handoff --> n_login
  n_login --> n_e
```

- Government ID upload is optional. If supplied, private upload validation still applies.
- SMS is selected only when no email is supplied. Failed email delivery does not automatically switch to the phone. Missing or failed delivery falls back to private librarian handoff.
- Provider acceptance is not proof that a message reached the inbox or handset. Entered contacts remain unverified until the separate email verification procedure.

Implementation references:

- [frontend/src/pages/lib/LibUsers.jsx](../../frontend/src/pages/lib/LibUsers.jsx)
- [backend/routers/librarian.py](../../backend/routers/librarian.py)
- [backend/services/registration_delivery.py](../../backend/services/registration_delivery.py)
- [backend/tests/test_auth_registration_uploads.py](../../backend/tests/test_auth_registration_uploads.py)

## 2.3.11 Forgotten Password and Librarian-Assisted Recovery

Shows recovery through a previously verified email or supervised librarian reset when email recovery is unavailable.

```mermaid
flowchart TD
  n_s(["Account holder opens password recovery"])
  n_identifier[/"Enter email or RPL Member ID"/]
  n_request["Request reset code without exposing account existence"]
  n_eligible{"Verified email and delivery available?"}
  n_assist["Visit librarian for supervised identity check"]
  n_reset["Librarian resets password and privately provides temporary credential"]
  n_first[["Sign in and replace temporary password (2.3.12)"]]
  n_mail[/"Retrieve six-digit code from verified mailbox"/]
  n_new[/"Enter code and valid new password"/]
  n_valid{"Code valid for current account?"}
  n_error["Show generic failure or waiting-period message"]
  n_save["Save new password; consume code; revoke prior sessions"]
  n_login["Return to sign-in with new password"]
  n_e(["Recovery complete"])
  n_s --> n_identifier
  n_identifier --> n_request
  n_request --> n_eligible
  n_eligible -->|"No / mailbox inaccessible"| n_assist
  n_assist -->|"Identity confirmed"| n_reset
  n_reset --> n_first
  n_first --> n_e
  n_eligible -->|"Yes"| n_mail
  n_mail --> n_new
  n_new --> n_valid
  n_valid -->|"No"| n_error
  n_error -.->|"Retry within limits"| n_request
  n_valid -->|"Yes"| n_save
  n_save --> n_login
  n_login --> n_e
```

- Self-service recovery uses a previously verified email. A phone number or registration SMS does not enable SMS password recovery.
- Public responses and errors avoid confirming which accounts exist. Code expiry, resend limits and attempt limits remain enforced.
- Librarian reset credentials can have a different length from the 10-character initial-registration password.

Implementation references:

- [frontend/src/pages/public/ForgotPasswordPage.jsx](../../frontend/src/pages/public/ForgotPasswordPage.jsx)
- [backend/routers/auth.py](../../backend/routers/auth.py)
- [backend/services/password_reset.py](../../backend/services/password_reset.py)
- [backend/routers/librarian.py](../../backend/routers/librarian.py)
- [backend/tests/test_password_recovery.py](../../backend/tests/test_password_recovery.py)

## 2.3.12 First-Login and Voluntary Password Change

Shows mandatory replacement of temporary passwords and authenticated password changes.

```mermaid
flowchart TD
  n_s(["Password change required or selected"])
  n_form[/"Enter current password, new password and confirmation"/]
  n_policy{"New values match and satisfy password policy?"}
  n_error["Show field errors"]
  n_submit["Submit to authenticated password-change endpoint"]
  n_current{"Account active and current password correct?"}
  n_reject["Show rejection; preserve password-change requirement"]
  n_save["Hash and save new password; clear temporary-password flag"]
  n_revoke["Revoke all prior sessions and unused reset codes"]
  n_replace["Create replacement session for this browser"]
  n_route["Open permitted member or librarian page"]
  n_e(["Password changed"])
  n_s --> n_form
  n_form --> n_policy
  n_policy -->|"No"| n_error
  n_error -.->|"Correct values"| n_form
  n_policy -->|"Yes"| n_submit
  n_submit --> n_current
  n_current -->|"No"| n_reject
  n_reject -.->|"Retry / seek recovery"| n_form
  n_current -->|"Yes"| n_save
  n_save --> n_revoke
  n_revoke --> n_replace
  n_replace --> n_route
  n_route --> n_e
```

- New passwords require 8-128 characters including at least one digit.
- Until a required replacement succeeds, ordinary protected actions are blocked. Session/profile retrieval, password change and logout remain available.

Implementation references:

- [frontend/src/pages/ChangePasswordPage.jsx](../../frontend/src/pages/ChangePasswordPage.jsx)
- [frontend/src/pages/user/UserProfile.jsx](../../frontend/src/pages/user/UserProfile.jsx)
- [backend/routers/users.py](../../backend/routers/users.py)
- [backend/dependencies.py](../../backend/dependencies.py)
- [backend/tests/test_first_login_password.py](../../backend/tests/test_first_login_password.py)

## 2.3.13 Profile Details and Optional Profile Photo

Shows permitted member contact edits, a locked verified name, and adding, changing or removing an avatar.

```mermaid
flowchart TD
  n_s(["Member opens Profile"])
  n_load["Load own profile; show verified name as read-only"]
  n_action{"Choose profile action"}
  n_edit[/"Edit phone or location; save"/]
  n_validate{"Allowed values and ownership valid?"}
  n_photo[/"Choose Add / Change photo and select image"/]
  n_file{"Image file and upload ownership valid?"}
  n_store["Store private avatar; attach to own profile"]
  n_remove[/"Choose Remove photo and confirm"/]
  n_owned{"Photo removable with verified storage ownership?"}
  n_delete["Remove private photo and clear avatar reference"]
  n_email[["Change or verify email (2.3.14)"]]
  n_error["Show error; retain last confirmed data"]
  n_refresh["Refresh profile and navigation avatar"]
  n_e(["Profile updated"])
  n_s --> n_load
  n_load --> n_action
  n_action -->|"Contact details"| n_edit
  n_edit --> n_validate
  n_validate -->|"Yes: save"| n_refresh
  n_validate -->|"No"| n_error
  n_action -->|"Add / change photo"| n_photo
  n_photo --> n_file
  n_file -->|"Yes"| n_store
  n_file -->|"No"| n_error
  n_store --> n_refresh
  n_action -->|"Remove photo"| n_remove
  n_remove --> n_owned
  n_owned -->|"Yes"| n_delete
  n_owned -->|"No / storage failure"| n_error
  n_delete --> n_refresh
  n_action -->|"Email"| n_email
  n_email --> n_refresh
  n_error -.->|"Correct / retry"| n_action
  n_refresh --> n_e
```

- Members cannot change their verified name in the form or by sending a different name to the server. Name corrections require library assistance.
- A profile photo is optional and separate from face-recognition enrollment. Removing an avatar does not delete the Face ID template.
- Only confirmed changes refresh the interface. Invalid or unavailable storage operations do not report a successful removal.

Implementation references:

- [frontend/src/pages/user/UserProfile.jsx](../../frontend/src/pages/user/UserProfile.jsx)
- [backend/routers/users.py](../../backend/routers/users.py)
- [backend/services/member_deletion.py](../../backend/services/member_deletion.py)
- [frontend/src/api/profileUpdates.js](../../frontend/src/api/profileUpdates.js)

## 2.3.14 Email Change and Contact Verification

Shows password-confirmed email changes and separate verification before the address can be used for recovery.

```mermaid
flowchart TD
  n_s(["Account holder opens email controls"])
  n_change{"Change saved email?"}
  n_input[/"Enter new email and current password"/]
  n_valid{"Password correct and email valid / available?"}
  n_error["Show correction or retry message"]
  n_save["Save email as unverified; invalidate obsolete reset codes"]
  n_verify[/"Select Verify Email; confirm current password"/]
  n_send{"Verification delivery accepted?"}
  n_code[/"Enter six-digit email code"/]
  n_check{"Code valid, unused and bound to saved email?"}
  n_verified["Mark current email verified"]
  n_e(["Verified email available for recovery"])
  n_s --> n_change
  n_change -->|"Yes"| n_input
  n_change -->|"No: verify saved email"| n_verify
  n_input --> n_valid
  n_valid -->|"No"| n_error
  n_valid -->|"Yes"| n_save
  n_save --> n_verify
  n_verify --> n_send
  n_send -->|"No / unavailable"| n_error
  n_send -->|"Yes"| n_code
  n_code --> n_check
  n_check -->|"No"| n_error
  n_check -->|"Yes"| n_verified
  n_error -.->|"Correct / retry within limits"| n_verify
  n_verified --> n_e
```

- Typing an email during registration or profile editing does not verify ownership.
- A changed email remains unverified until the purpose/contact-bound code succeeds. Never publish verification codes in documentation or screenshots.

Implementation references:

- [frontend/src/components/EmailContact.jsx](../../frontend/src/components/EmailContact.jsx)
- [backend/routers/auth.py](../../backend/routers/auth.py)
- [backend/routers/users.py](../../backend/routers/users.py)
- [backend/services/password_reset.py](../../backend/services/password_reset.py)

## 2.3.15 Reservation Queue, Pickup, Cancellation and Expiry

Shows the lifecycle of ready and queued reservations, including FIFO promotion and cancellation.

```mermaid
flowchart TD
  n_s(["Reservation batch accepted"])
  n_capacity{"Unheld title capacity available?"}
  n_ready["Mark Ready; set 24-hour pickup deadline"]
  n_pending["Mark Pending in FIFO queue; no stock held"]
  n_availability{"Capacity freed by return, cancellation or expiry?"}
  n_wait["Keep queue position; wait for a later policy refresh"]
  n_promote["Promote next eligible queued member"]
  n_status{"Ready reservation outcome?"}
  n_pickup[["Librarian issues exact physical copy (2.3.7a)"]]
  n_fulfilled["Mark Fulfilled; reservation becomes loan"]
  n_cancel["Cancel member-owned or librarian-selected reservation"]
  n_expired["Cancel expired ready hold on policy synchronization"]
  n_release["Release title capacity; promote next eligible request"]
  n_e(["Refresh reservation list and remaining slots"])
  n_s --> n_capacity
  n_capacity -->|"Yes"| n_ready
  n_capacity -->|"No; queue accepted"| n_pending
  n_pending --> n_availability
  n_availability -->|"No"| n_wait
  n_wait -.->|"Policy refresh"| n_availability
  n_availability -->|"Yes"| n_promote
  n_promote --> n_ready
  n_pending -->|"Member / librarian cancels"| n_cancel
  n_ready --> n_status
  n_status -->|"Picked up before deadline"| n_pickup
  n_pickup --> n_fulfilled
  n_status -->|"Cancelled"| n_cancel
  n_status -->|"Deadline passed"| n_expired
  n_cancel --> n_release
  n_expired --> n_release
  n_fulfilled --> n_e
  n_release --> n_e
```

- Only ready reservations hold title-level capacity. Pending requests do not allocate stock, and no reservation guarantees a particular physical copy.
- Expiry/promotion runs when relevant requests or stock-changing operations synchronize policy; there is no claim of a continuously running expiry scheduler.
- Both ready and queued reservations count toward the combined five-book allowance. Refreshing a page does not extend a pickup deadline.

Implementation references:

- [backend/services/reservation_policy.py](../../backend/services/reservation_policy.py)
- [backend/services/reservation_confirmation.py](../../backend/services/reservation_confirmation.py)
- [backend/routers/reservations.py](../../backend/routers/reservations.py)
- [frontend/src/pages/lib/LibReservations.jsx](../../frontend/src/pages/lib/LibReservations.jsx)
- [backend/tests/test_reservation_policy.py](../../backend/tests/test_reservation_policy.py)

## 2.3.16 Inventory Editing, Stock Adjustment and Title Deletion

Shows updating book metadata or covers, safe stock changes, and history-protected title deletion.

```mermaid
flowchart TD
  n_s(["Librarian opens Browse Books / Inventory"])
  n_find[/"Search title; inspect View details"/]
  n_choice{"Choose inventory action"}
  n_edit[/"Edit allowed metadata, description, shelf or copy total"/]
  n_validate{"Stock and history rules satisfied?"}
  n_stock["Save metadata; create new copies or retire eligible excess copies"]
  n_cover[/"Choose validated replacement cover"/]
  n_upload["Store cover and attach to existing title"]
  n_remove[/"Request title deletion and confirm"/]
  n_history{"No protected loan or reservation history?"}
  n_delete["Delete permitted title; clean unused cover"]
  n_blocked["Show validation or history restriction"]
  n_refresh["Refresh inventory and catalog"]
  n_e(["Finished"])
  n_s --> n_find
  n_find --> n_choice
  n_choice -->|"Edit / stock"| n_edit
  n_edit --> n_validate
  n_validate -->|"Yes"| n_stock
  n_validate -->|"No"| n_blocked
  n_stock --> n_refresh
  n_choice -->|"Cover"| n_cover
  n_cover --> n_upload
  n_upload --> n_refresh
  n_choice -->|"Delete"| n_remove
  n_remove --> n_history
  n_history -->|"Yes"| n_delete
  n_history -->|"No"| n_blocked
  n_delete --> n_refresh
  n_blocked -.->|"Review another action"| n_choice
  n_refresh --> n_e
```

- Reducing stock retires eligible physical copies; it does not delete or recycle their QR identities. Borrowed copies and ready-reservation capacity remain protected.
- View details is read-only. Books with historical loan or reservation dependencies cannot be casually deleted.
- Category review has its own workflow (2.3.28). Acquisition metadata is maintained through Reports, not an Acquisitions button in the inventory row.

Implementation references:

- [frontend/src/pages/lib/LibInventory.jsx](../../frontend/src/pages/lib/LibInventory.jsx)
- [frontend/src/components/BookEditDialog.jsx](../../frontend/src/components/BookEditDialog.jsx)
- [backend/routers/inventory.py](../../backend/routers/inventory.py)
- [backend/services/book_copy_service.py](../../backend/services/book_copy_service.py)
- [backend/tests/test_book_edit.py](../../backend/tests/test_book_edit.py)

## 2.3.17 ISBN Lookup and Workbook Book Import

Shows multiple ISBN-assisted additions and complete-record XLSX import with separate results for valid, duplicate and rejected rows.

```mermaid
flowchart TD
  n_s(["Librarian opens Add Book import tools"])
  n_method{"Choose bulk method"}
  n_isbns[/"Enter or extract multiple ISBNs"/]
  n_lookup["Look up metadata; preview found and missing titles"]
  n_review[/"Review selected entries and correct metadata"/]
  n_add["Submit selected books with stable request identities"]
  n_workbook[/"Select complete-record XLSX workbook"/]
  n_validate{"Valid format, size and headers?"}
  n_parse["Parse and validate individual rows"]
  n_rows["Import valid new rows; skip duplicate ISBNs; record row errors"]
  n_qr["Create unique physical-copy QR identities for imported titles"]
  n_results["Show added, skipped and failed results"]
  n_retry[["Resolve unknown save outcome before retry (2.3.27)"]]
  n_error["Show validation error; correct original file"]
  n_e(["Review inventory and print labels"])
  n_s --> n_method
  n_method -->|"ISBN lookup"| n_isbns
  n_isbns --> n_lookup
  n_lookup --> n_review
  n_review --> n_add
  n_add --> n_results
  n_method -->|"Full records"| n_workbook
  n_workbook --> n_validate
  n_validate -->|"No"| n_error
  n_error -.->|"Correct file"| n_workbook
  n_validate -->|"Yes"| n_parse
  n_parse --> n_rows
  n_rows --> n_qr
  n_qr --> n_results
  n_results -->|"Outcome uncertain"| n_retry
  n_retry -->|"Recovered result"| n_results
  n_results -->|"Outcome known"| n_e
```

- Full inventory import uses XLSX; legacy XLS must be converted. The current server limit is 10 MB. ISBN-only extraction/lookup is a different workflow.
- A workbook can report partial row errors. Preserve successful results; do not assume that one bad row rolls back every imported book.
- Retryable workbook requests are bound to the original file fingerprint and request ID. Acquisition-metadata CSV/XLSX import is separate (2.3.25).

Implementation references:

- [frontend/src/pages/lib/LibAddBook.jsx](../../frontend/src/pages/lib/LibAddBook.jsx)
- [backend/routers/inventory.py](../../backend/routers/inventory.py)
- [backend/services/excel_service.py](../../backend/services/excel_service.py)
- [frontend/src/api/inventoryWrites.js](../../frontend/src/api/inventoryWrites.js)

## 2.3.18 Member Status, Password Reset and Account Removal

Shows supervised account administration with separate status, reset and deletion actions.

```mermaid
flowchart TD
  n_s(["Librarian opens Members"])
  n_find[/"Search and select the correct member"/]
  n_action{"Choose administrative action"}
  n_status[/"Choose Active or Suspended"/]
  n_save["Save status; revoke sessions when suspended"]
  n_reset[/"Request supervised password reset"/]
  n_credential["Generate temporary credential; revoke prior sessions; require replacement"]
  n_handoff["Provide displayed credential privately to member"]
  n_remove[/"Choose Delete account; confirm librarian password"/]
  n_allowed{"No outstanding loans; deletion safe?"}
  n_blocked["Show restriction; resolve loans, identity or storage issue"]
  n_soft["Remove permitted private data; disable account; retain protected history"]
  n_e(["Refresh member list"])
  n_s --> n_find
  n_find --> n_action
  n_action -->|"Account status"| n_status
  n_status --> n_save
  n_save --> n_e
  n_action -->|"Reset password"| n_reset
  n_reset --> n_credential
  n_credential --> n_handoff
  n_handoff --> n_e
  n_action -->|"Delete account"| n_remove
  n_remove --> n_allowed
  n_allowed -->|"No"| n_blocked
  n_blocked --> n_e
  n_allowed -->|"Yes"| n_soft
  n_soft --> n_e
```

- A librarian password is required for destructive member/face deletion. Account deletion is blocked while books remain outstanding.
- Member account removal follows the implemented soft-deletion and private-file ownership checks; it is not arbitrary deletion of lending history.
- Resetting a member password is distinct from registration email/SMS delivery. Use the credential actually returned for the reset operation.

Implementation references:

- [frontend/src/pages/lib/LibUsers.jsx](../../frontend/src/pages/lib/LibUsers.jsx)
- [backend/routers/librarian.py](../../backend/routers/librarian.py)
- [backend/services/member_deletion.py](../../backend/services/member_deletion.py)

## 2.3.19 Librarian-Assisted Face Enrollment and Face Removal

Shows supervised enrollment or replacement with live-face and duplicate-account checks, plus explicit face-data removal.

```mermaid
flowchart TD
  n_s(["Librarian selects verified member"])
  n_method{"Enroll / replace or delete Face ID?"}
  n_capture[/"Start camera; capture a clear live-face image"/]
  n_live{"Live-face and quality checks pass?"}
  n_duplicate{"Face belongs to another account?"}
  n_reject["Show failure; do not replace existing enrollment"]
  n_encode["Create protected recognition template and save enrollment"]
  n_remove[/"Choose Delete face data; enter librarian password"/]
  n_password{"Librarian password valid?"}
  n_delete["Delete stored face templates and associated face snapshots; revoke member sessions"]
  n_refresh["Refresh face-enrollment status; stop camera"]
  n_e(["Finished"])
  n_s --> n_method
  n_method -->|"Enroll / replace"| n_capture
  n_capture --> n_live
  n_live -->|"No / uncertain"| n_reject
  n_live -->|"Yes"| n_duplicate
  n_duplicate -->|"Yes"| n_reject
  n_duplicate -->|"No"| n_encode
  n_encode --> n_refresh
  n_reject --> n_refresh
  n_method -->|"Delete"| n_remove
  n_remove --> n_password
  n_password -->|"No"| n_reject
  n_password -->|"Yes"| n_delete
  n_delete --> n_refresh
  n_refresh --> n_e
```

- Enrollment is librarian-assisted and distinct from a profile photo. A failed PAD/quality check must not become a successful enrollment.
- Duplicate-face checks prevent enrollment to another account. Existing recognition compatibility and encrypted biometric storage remain in place.
- Face-data removal does not delete loan history or the entire member account. It is a separate explicit operation.

Implementation references:

- [frontend/src/pages/lib/LibUsers.jsx](../../frontend/src/pages/lib/LibUsers.jsx)
- [backend/routers/librarian.py](../../backend/routers/librarian.py)
- [backend/services/face_engine_service.py](../../backend/services/face_engine_service.py)
- [backend/services/member_deletion.py](../../backend/services/member_deletion.py)
- [backend/tests/test_face_engine_upgrade.py](../../backend/tests/test_face_engine_upgrade.py)

## 2.3.20 Recommendations, Trending and Favorites

Shows history-dependent Featured shelves, favorites, and genre sorting without inventing a star-rating feature.

```mermaid
flowchart TD
  n_s(["Member opens Browse Books"])
  n_history{"Previous borrowing history exists?"}
  n_recommend["Load recommendations from member activity and similar items"]
  n_fallback["Use content / popularity fallback where needed"]
  n_trending["Show Trending shelf"]
  n_new["Show What's new and Books we love shelves"]
  n_choose{"Choose discovery action"}
  n_favorite[/"Toggle heart for a title"/]
  n_save["Save or remove own favorite after server confirmation"]
  n_genre[/"Choose genre / All Books; select Trending, Newest, Most loved or Title"/]
  n_results["Show sorted, paged matching books"]
  n_view[["View details or add to selection (2.3.3)"]]
  n_e(["Continue browsing"])
  n_s --> n_history
  n_history -->|"Yes"| n_recommend
  n_recommend --> n_fallback
  n_fallback --> n_trending
  n_history -->|"New member"| n_trending
  n_trending --> n_new
  n_new --> n_choose
  n_choose -->|"Favorite"| n_favorite
  n_favorite --> n_save
  n_save --> n_e
  n_choose -->|"Genre / sort"| n_genre
  n_genre --> n_results
  n_results --> n_view
  n_choose -->|"Open title"| n_view
  n_view --> n_e
```

- Members with borrowing history see Recommended for you above Trending. New members begin with Trending. Featured collections scroll sideways.
- Books we love and Most loved use recorded favorites; there is no star-rating or separate editorial-review feature.
- Recommendations are calculated on demand with collaborative, content and popularity fallbacks. The system does not claim a separately trained model or measured reader accuracy.

Implementation references:

- [frontend/src/pages/user/UserBrowseBooks.jsx](../../frontend/src/pages/user/UserBrowseBooks.jsx)
- [backend/routers/recommendations.py](../../backend/routers/recommendations.py)
- [backend/routers/books.py](../../backend/routers/books.py)
- [frontend/src/api/useBookRecommendations.js](../../frontend/src/api/useBookRecommendations.js)

## 2.3.21 Reading Activity, Goals and Personal Transcript

Shows viewing recorded reading/visit information, saving goals, and downloading the account-owned transcript.

```mermaid
flowchart TD
  n_s(["Member opens Dashboard"])
  n_load["Load own loans, reading statistics, activity and goals"]
  n_action{"Choose activity task"}
  n_view["Review recorded borrowing, genres and library visits"]
  n_goals[/"Select Set Goals; enter books, genres and visit targets"/]
  n_valid{"Goal values valid?"}
  n_error["Show validation error"]
  n_save["Save goals for current member"]
  n_transcript[/"Request own transcript through supported API service"/]
  n_authorized{"Authenticated owner and report request valid?"}
  n_pdf["Generate own reading transcript PDF"]
  n_failure["Show error; keep current records"]
  n_e(["Review confirmed result"])
  n_s --> n_load
  n_load --> n_action
  n_action -->|"View activity"| n_view
  n_view --> n_e
  n_action -->|"Set Goals"| n_goals
  n_goals --> n_valid
  n_valid -->|"No"| n_error
  n_error -.->|"Correct values"| n_goals
  n_valid -->|"Yes"| n_save
  n_save --> n_e
  n_action -->|"Transcript service"| n_transcript
  n_transcript --> n_authorized
  n_authorized -->|"Yes"| n_pdf
  n_authorized -->|"No"| n_failure
  n_pdf --> n_e
  n_failure --> n_e
```

- Visits are attendance sessions, not proof that a particular book was read. Charts summarize recorded activity.
- Transcripts are owner-scoped. Members cannot download another member profile or transcript by changing an identifier.
- The owner-scoped transcript API exists, but the current member pages do not show a transcript download button. That branch describes the supported service.

Implementation references:

- [frontend/src/pages/user/UserHome.jsx](../../frontend/src/pages/user/UserHome.jsx)
- [frontend/src/pages/user/UserProfile.jsx](../../frontend/src/pages/user/UserProfile.jsx)
- [backend/routers/recommendations.py](../../backend/routers/recommendations.py)
- [backend/routers/reports.py](../../backend/routers/reports.py)

## 2.3.22 Loan Issue Reports and In-App Notifications

Shows member reporting of a current loan problem and librarian review of the resulting in-app notification.

```mermaid
flowchart TD
  n_s(["Member reviews an outstanding loan"])
  n_report[/"Select Report Issue"/]
  n_reason[/"Choose damaged, wrong book, lost or other; add optional note"/]
  n_submit["Submit against original loan transaction"]
  n_owner{"Loan is outstanding and owned by current member?"}
  n_reject["Show rejection; do not create report"]
  n_notice["Create librarian in-app loan-issue notification"]
  n_staff[/"Librarian opens notifications and reviews issue"/]
  n_follow["Use approved supervised resolution process"]
  n_read[/"Mark notification read or mark all own notices read"/]
  n_e(["Issue communicated; loan state unchanged"])
  n_s --> n_report
  n_report --> n_reason
  n_reason --> n_submit
  n_submit --> n_owner
  n_owner -->|"No"| n_reject
  n_reject --> n_e
  n_owner -->|"Yes"| n_notice
  n_notice --> n_staff
  n_staff --> n_follow
  n_follow --> n_read
  n_read --> n_e
```

- Submitting an issue is not a return, copy replacement, fine settlement or payment. Book-condition photo capture is not implemented.
- Members also receive their own in-app notices, such as reservation status updates, and can mark them read. Read status is account-scoped.
- No email/SMS delivery is implied by an in-app notice.

Implementation references:

- [frontend/src/pages/user/UserHome.jsx](../../frontend/src/pages/user/UserHome.jsx)
- [backend/routers/transactions.py](../../backend/routers/transactions.py)
- [backend/routers/users.py](../../backend/routers/users.py)
- [backend/routers/librarian.py](../../backend/routers/librarian.py)

## 2.3.23 Physical-Copy QR Label Download and Bulk Export

Shows individual PNG labels, selected-copy PDFs, and complete matching-copy exports with bounded batches.

```mermaid
flowchart TD
  n_s(["Librarian opens Print QR"])
  n_search[/"Search title, author or physical-copy QR"/]
  n_mode{"Choose label scope"}
  n_single[/"Choose exact copy; download PNG"/]
  n_selected[/"Select copies; Select Visible affects current page only"/]
  n_limit{"1-1,000 copies selected?"}
  n_pdf["Generate selected-copy PDF"]
  n_all[/"Select Export all matching"/]
  n_snapshot["Capture matching physical-copy IDs"]
  n_batches["Fetch bounded label batches and count manifest"]
  n_complete{"Every requested label generated?"}
  n_zip["Build ZIP after all batches succeed"]
  n_error["Show error; preserve selection and offer retry"]
  n_print[/"Print and attach each exact-copy label"/]
  n_e(["Labels prepared"])
  n_s --> n_search
  n_search --> n_mode
  n_mode -->|"One copy"| n_single
  n_single --> n_print
  n_mode -->|"Selected copies"| n_selected
  n_selected --> n_limit
  n_limit -->|"Yes"| n_pdf
  n_limit -->|"No: use matching export"| n_error
  n_pdf --> n_print
  n_mode -->|"All matching"| n_all
  n_all --> n_snapshot
  n_snapshot --> n_batches
  n_batches --> n_complete
  n_complete -->|"Yes"| n_zip
  n_complete -->|"No"| n_error
  n_zip --> n_print
  n_error -.->|"Correct / retry"| n_mode
  n_print --> n_e
```

- A printed code identifies one physical copy. Reprinting does not add stock, change copy identity, or record a loan.
- Complete matching export uses label batches of 200 and fails visibly if any expected identity or batch is missing. Do not treat an interrupted download as complete.

Implementation references:

- [frontend/src/pages/lib/LibQRBulk.jsx](../../frontend/src/pages/lib/LibQRBulk.jsx)
- [frontend/src/api/librarian.js](../../frontend/src/api/librarian.js)
- [backend/routers/inventory.py](../../backend/routers/inventory.py)
- [backend/services/book_copy_service.py](../../backend/services/book_copy_service.py)

## 2.3.24 Appearance Settings and Entrance Station PIN Replacement

Shows browser appearance preferences and password-confirmed replacement of the staff station PIN.

```mermaid
flowchart TD
  n_s(["Open applicable appearance controls or librarian Settings"])
  n_choice{"Choose setting"}
  n_appearance[/"Choose Light or Dark appearance"/]
  n_local["Save current-browser theme preference"]
  n_pin[/"Librarian checks station PIN configured status"/]
  n_input[/"Enter current librarian password and repeat a new 6-12 digit PIN"/]
  n_valid{"Password correct and PIN values valid / matching?"}
  n_error["Show correction message"]
  n_save["Store only protected PIN hash; activate new station PIN"]
  n_stations["Older stations fail next PIN check; unlock with new PIN"]
  n_e(["Settings confirmed"])
  n_s --> n_choice
  n_choice -->|"Appearance"| n_appearance
  n_appearance --> n_local
  n_local --> n_e
  n_choice -->|"Station PIN"| n_pin
  n_pin --> n_input
  n_input --> n_valid
  n_valid -->|"No"| n_error
  n_error -.->|"Correct values"| n_input
  n_valid -->|"Yes"| n_save
  n_save --> n_stations
  n_stations --> n_e
```

- Only librarians manage the station PIN. The existing PIN is never displayed; replacement requires the librarian password, not the old PIN.
- A configured database PIN takes precedence over the server fallback and is checked on each station request. Station PINs and account passwords serve different purposes.

Implementation references:

- [frontend/src/pages/lib/LibSettings.jsx](../../frontend/src/pages/lib/LibSettings.jsx)
- [frontend/src/components/UserLayout.jsx](../../frontend/src/components/UserLayout.jsx)
- [backend/routers/librarian_settings.py](../../backend/routers/librarian_settings.py)
- [backend/services/entry_station_pin.py](../../backend/services/entry_station_pin.py)
- [backend/tests/test_entry_station_pin.py](../../backend/tests/test_entry_station_pin.py)

## 2.3.25 Acquisition Metadata Entry and Import

Shows recording verified acquisition details on existing physical copies through the reporting workspace.

```mermaid
flowchart TD
  n_s(["Librarian opens Reports: Acquisitions"])
  n_method{"Single copy or metadata import?"}
  n_copy[/"Enter numeric physical-copy ID; look up and verify title"/]
  n_edit[/"Enter verified source, date, donor / supplier, cost and reference"/]
  n_file[/"Prepare CSV / XLSX metadata file; upload for preview"/]
  n_preview{"File and all referenced copy IDs valid?"}
  n_review[/"Review replacements; confirm Apply acquisition records"/]
  n_version{"Copy data and version still valid?"}
  n_error["Show errors or changed record; reload / preview again"]
  n_save["Save acquisition metadata for existing copies"]
  n_refresh["Refresh acquisition report and preview"]
  n_e(["Metadata recorded; stock unchanged"])
  n_s --> n_method
  n_method -->|"Single"| n_copy
  n_copy --> n_edit
  n_edit --> n_version
  n_method -->|"Import"| n_file
  n_file --> n_preview
  n_preview -->|"No"| n_error
  n_preview -->|"Yes"| n_review
  n_review --> n_version
  n_version -->|"No"| n_error
  n_error -.->|"Correct / reload"| n_method
  n_version -->|"Yes"| n_save
  n_save --> n_refresh
  n_refresh --> n_e
```

- This reporting workflow requires the separate reporting schema. It is not the removed Acquisition details section of Add Book.
- Acquisition imports are limited to 500 rows and 1 MB. Blank imported cells clear existing acquisition fields; preview does not save anything.
- Metadata refers to existing physical-copy IDs, not a printed QR string. It does not create stock or reassign physical-copy codes.

Implementation references:

- [frontend/src/components/reporting/AcquisitionEditor.jsx](../../frontend/src/components/reporting/AcquisitionEditor.jsx)
- [backend/routers/reporting.py](../../backend/routers/reporting.py)
- [backend/schemas/reporting.py](../../backend/schemas/reporting.py)
- [backend/tests/test_reporting_center.py](../../backend/tests/test_reporting_center.py)

## 2.3.26 Librarian Workspace, Dashboard and Navigation

Shows the initially hidden sidebar, dashboard summaries and access to each librarian workspace.

```mermaid
flowchart TD
  n_s(["Librarian authentication complete"])
  n_home["Open Dashboard; load authorized summaries and charts"]
  n_menu[/"Open menu icon to reveal hidden sidebar"/]
  n_choose{"Choose work area"}
  n_collection[["Browse Books / Add Book / Print QR (2.3.6, 2.3.16, 2.3.23)"]]
  n_circulation[["Borrow / Return / Reservations / Due Books (2.3.7, 2.3.9, 2.3.15)"]]
  n_people[["Members and face enrollment (2.3.10, 2.3.18, 2.3.19)"]]
  n_reports[["Reports and acquisition metadata (2.3.8, 2.3.25)"]]
  n_settings[["Settings and station PIN (2.3.24)"]]
  n_next{"Continue working?"}
  n_logout["Sign out; revoke current browser session"]
  n_e(["Return to public staff portal"])
  n_s --> n_home
  n_home --> n_menu
  n_menu --> n_choose
  n_choose -->|"Collection"| n_collection
  n_choose -->|"Circulation"| n_circulation
  n_choose -->|"Members"| n_people
  n_choose -->|"Reports"| n_reports
  n_choose -->|"Settings"| n_settings
  n_collection --> n_next
  n_circulation --> n_next
  n_people --> n_next
  n_reports --> n_next
  n_settings --> n_next
  n_next -.->|"Yes"| n_menu
  n_next -->|"No"| n_logout
  n_logout --> n_e
```

- The sidebar starts hidden on desktop and mobile. Selecting navigation opens the chosen workspace without changing its authorization requirements.
- Dashboard notifications and shortcuts link to the relevant workflows. A summary card is not itself a circulation submission.

Implementation references:

- [frontend/src/components/LibLayout.jsx](../../frontend/src/components/LibLayout.jsx)
- [frontend/src/pages/lib/LibDashboard.jsx](../../frontend/src/pages/lib/LibDashboard.jsx)
- [frontend/src/App.jsx](../../frontend/src/App.jsx)
- [backend/routers/auth.py](../../backend/routers/auth.py)

## 2.3.27 Safe Submission, Partial Results and Unknown Outcome Recovery

Shows how reservation, inventory and circulation writes preserve request identity and avoid accidental duplicate actions.

```mermaid
flowchart TD
  n_s(["Review a write operation"])
  n_prepare["Save original payload and account-scoped request ID"]
  n_send[/"Submit online; do not treat scan or local selection as success"/]
  n_known{"Definite server result received?"}
  n_unknown["Stop further dependent submissions; preserve pending request"]
  n_recover[/"Recover saved request using original ID"/]
  n_kind{"Request type?"}
  n_receipt["Inventory / circulation: look up saved receipt; explicitly retry same key if needed"]
  n_batch["Reservation: retry exact saved confirmation batch"]
  n_resolved{"Outcome now confirmed?"}
  n_keep["Keep unknown state; request assistance without inventing success"]
  n_success{"Operation accepted?"}
  n_failed["Show definitive rejection and unattempted items"]
  n_commit["Show committed result; preserve earlier confirmed successes"]
  n_more{"More independent circulation items?"}
  n_e(["Review final results"])
  n_s --> n_prepare
  n_prepare --> n_send
  n_send --> n_known
  n_known -->|"No / interrupted"| n_unknown
  n_unknown --> n_recover
  n_recover --> n_kind
  n_kind -->|"Inventory / circulation"| n_receipt
  n_kind -->|"Reservation"| n_batch
  n_receipt --> n_resolved
  n_batch --> n_resolved
  n_resolved -->|"No"| n_keep
  n_keep --> n_e
  n_resolved -->|"Yes"| n_success
  n_known -->|"Yes"| n_success
  n_success -->|"Rejected"| n_failed
  n_failed --> n_e
  n_success -->|"Accepted"| n_commit
  n_commit --> n_more
  n_more -.->|"Yes; next item"| n_prepare
  n_more -->|"No"| n_e
```

- Do not clear pending recovery information, invent a new key, or infer success from a similar-looking loan. An unknown result is not a confirmed failure.
- Circulation lists send independent sequential requests; earlier successes remain valid. Reservation confirmation is an atomic batch.
- There is no durable offline queue or automatic write replay. Recovery and retry require a server connection and the original operation identity.

Implementation references:

- [frontend/src/api/circulationRecovery.js](../../frontend/src/api/circulationRecovery.js)
- [frontend/src/api/inventoryWrites.js](../../frontend/src/api/inventoryWrites.js)
- [frontend/src/pages/user/UserReservations.jsx](../../frontend/src/pages/user/UserReservations.jsx)
- [backend/services/inventory_writes.py](../../backend/services/inventory_writes.py)
- [backend/tests/test_circulation_atomicity.py](../../backend/tests/test_circulation_atomicity.py)

## 2.3.28 Category Normalization and Librarian Review

Shows automatic server category mapping and the Add Book review panel for unresolved imported labels.

```mermaid
flowchart TD
  n_s(["New or imported category label received"])
  n_map["Check saved override or supported category mapping"]
  n_known{"Supported category resolved?"}
  n_normal["Save normalized category and visible catalog state"]
  n_hidden["Preserve original label; mark unresolved book hidden"]
  n_review[/"Librarian opens Add Book: Category review panel"/]
  n_choice[/"Select supported master category; submit resolution"/]
  n_valid{"Librarian and master category valid?"}
  n_error["Show error; preserve unresolved state"]
  n_save["Apply category override to hidden books with exact original label"]
  n_refresh["Make resolved books available to category lists and catalog"]
  n_e(["Category state saved"])
  n_s --> n_map
  n_map --> n_known
  n_known -->|"Yes"| n_normal
  n_normal --> n_e
  n_known -->|"No"| n_hidden
  n_hidden --> n_review
  n_review --> n_choice
  n_choice --> n_valid
  n_valid -->|"No"| n_error
  n_error -.->|"Correct resolution"| n_choice
  n_valid -->|"Yes"| n_save
  n_save --> n_refresh
  n_refresh --> n_e
```

- Raw labels are reconciled to the supported genre vocabulary. Unresolved books retain the original label and remain hidden until an authorized resolution.
- The Category review panel appears on Add Book. Choosing a master category resolves hidden books with the same exact original label; a suggestion alone does not save a resolution.

Implementation references:

- [frontend/src/components/CategoryReview.jsx](../../frontend/src/components/CategoryReview.jsx)
- [frontend/src/pages/lib/LibAddBook.jsx](../../frontend/src/pages/lib/LibAddBook.jsx)
- [backend/routers/inventory.py](../../backend/routers/inventory.py)
- [backend/services/category_service.py](../../backend/services/category_service.py)
