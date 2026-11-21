# Simple black-and-white system flowcharts

17 November 2026. Revised to match the supplied academic flowchart examples.

The diagrams show main user actions. Detailed rules and source references remain in the original flowchart documentation.

## 2.3.1 Login and Role Routing

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open sign-in page"]
  n_b[/"Enter password or scan face"/]
  n_q{"Login valid?"}
  n_err["Show login error"]
  n_t{"Temporary password?"}
  n_change["Change password"]
  n_r{"Account role?"}
  n_member["Open member home"]
  n_staff["Open librarian home"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_t
  n_t -->|"Yes"| n_change
  n_change --> n_r
  n_t -->|"No"| n_r
  n_r -->|"Member"| n_member
  n_r -->|"Librarian"| n_staff
  n_member --> n_e
  n_staff --> n_e
```

## 2.3.2 Borrower Navigation

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open member home"]
  n_b[/"Choose a page"/]
  n_q{"Selected page?"}
  n_h["View dashboard"]
  n_browse["Browse books"]
  n_res["Open My Reservations"]
  n_p["View profile"]
  n_c["Continue using member portal"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_q
  n_q -->|"Home"| n_h
  n_q -->|"Browse"| n_browse
  n_q -->|"Reservations"| n_res
  n_q -->|"Profile"| n_p
  n_h --> n_c
  n_browse --> n_c
  n_res --> n_c
  n_p --> n_c
  n_c --> n_e
```

## 2.3.3 Browse Books and Add to Reservation Cart

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Browse Books"]
  n_b[/"Search or choose a category"/]
  n_c["View book details"]
  n_q{"Member signed in?"}
  n_login["Sign in first"]
  n_t{"Can select book?"}
  n_cart["Add book to selection"]
  n_err["Show limit or duplicate notice"]
  n_res["Open My Reservations"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_login
  n_login --> n_t
  n_q -->|"Yes"| n_t
  n_t -->|"Yes"| n_cart
  n_t -->|"No"| n_err
  n_err --> n_e
  n_cart --> n_res
  n_res --> n_e
```

## 2.3.4 Reservation Checkout and Five-Book Limit

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open My Reservations"]
  n_b["Review selected books"]
  n_q{"Queue needed?"}
  n_agree["Accept waiting list"]
  n_t{"Within five-book limit?"}
  n_err["Show error and revise selection"]
  n_c[/"Confirm reservation"/]
  n_save["Save ready or queued reservations"]
  n_show["Display reservation status"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_q
  n_q -->|"Yes"| n_agree
  n_agree --> n_t
  n_q -->|"No"| n_t
  n_t -->|"No"| n_err
  n_err --> n_e
  n_t -->|"Yes"| n_c
  n_c --> n_save
  n_save --> n_show
  n_show --> n_e
```

## 2.3.5 Staff Logging and Entrance Attendance

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Entrance Station"]
  n_b[/"Enter station PIN"/]
  n_c[/"Start camera and scan face"/]
  n_q{"Valid live face?"}
  n_err["Show unsuccessful scan"]
  n_t{"Member inside?"}
  n_out["Record time-out"]
  n_in["Record time-in"]
  n_show["Display attendance log"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_t
  n_t -->|"Yes"| n_out
  n_t -->|"No"| n_in
  n_out --> n_show
  n_in --> n_show
  n_show --> n_e
```

## 2.3.6 Add Book and QR Code Generation

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Add Book"]
  n_b[/"Enter details or use ISBN lookup"/]
  n_c[/"Add optional description and cover"/]
  n_q{"Book details valid?"}
  n_err["Display validation error"]
  n_save["Save book and physical copies"]
  n_qr["Generate unique copy QR codes"]
  n_print["Download or print labels"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_qr
  n_qr --> n_print
  n_print --> n_e
```

## 2.3.7a Borrow Transaction

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Borrow mode"]
  n_b[/"Identify member by face or manual ID"/]
  n_q{"Ready reservation?"}
  n_res["Select Add to list"]
  n_walk[/"Scan QR or enter book code"/]
  n_c["Review member and exact copies"]
  n_d[/"Confirm borrowing"/]
  n_t{"Borrowing rules pass?"}
  n_err["Show rejected item"]
  n_save["Record loan and due date"]
  n_stock["Update copy and reservation status"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_q
  n_q -->|"Yes"| n_res
  n_q -->|"No"| n_walk
  n_res --> n_c
  n_walk --> n_c
  n_c --> n_d
  n_d --> n_t
  n_t -->|"No"| n_err
  n_err --> n_e
  n_t -->|"Yes"| n_save
  n_save --> n_stock
  n_stock --> n_e
```

## 2.3.7b Return Transaction

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Return mode"]
  n_b[/"Scan QR or enter book code"/]
  n_c["Identify original loan"]
  n_d["Review borrower and copy"]
  n_q{"Return details valid?"}
  n_err["Display return error"]
  n_save["Record return on original loan"]
  n_stock["Update availability"]
  n_queue["Promote waiting reservation"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_d
  n_d --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_stock
  n_stock --> n_queue
  n_queue --> n_e
```

## 2.3.8 Report Generation

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Reports and Analytics"]
  n_b[/"Select report and date range"/]
  n_c["Apply filters"]
  n_d["Retrieve matching records"]
  n_show["Display report preview"]
  n_q{"Export report?"}
  n_file["Choose PDF, Excel, CSV or Print"]
  n_save["Generate selected report"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_d
  n_d --> n_show
  n_show --> n_q
  n_q -->|"No"| n_e
  n_q -->|"Yes"| n_file
  n_file --> n_save
  n_save --> n_e
```

## 2.3.9 Due Books Monitoring

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Librarian opens Due Books"]
  n_b["System checks outstanding loans"]
  n_c["Apply selected due-date filter"]
  n_d["Display due and overdue books"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_d
  n_d --> n_e
```

## 2.3.10 Member Registration and Temporary Password Delivery

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Register Member"]
  n_b[/"Enter member details and optional ID"/]
  n_c["Create member and temporary password"]
  n_q{"Email provided?"}
  n_mail["Send by configured email"]
  n_t{"Phone provided?"}
  n_sms["Send by configured SMS"]
  n_hand["Provide password through librarian"]
  n_ok{"Delivery accepted?"}
  n_change["Member changes password at first login"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"Yes"| n_mail
  n_q -->|"No"| n_t
  n_t -->|"Yes"| n_sms
  n_t -->|"No"| n_hand
  n_mail --> n_ok
  n_sms --> n_ok
  n_ok -->|"Yes"| n_change
  n_ok -->|"No"| n_hand
  n_hand --> n_change
  n_change --> n_e
```

## 2.3.11 Forgotten Password and Librarian-Assisted Recovery

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Forgot Password"]
  n_b[/"Enter email or Member ID"/]
  n_q{"Verified email available?"}
  n_mail["Send reset code"]
  n_c[/"Enter code and new password"/]
  n_t{"Reset code valid?"}
  n_save["Save password and revoke old sessions"]
  n_staff["Request supervised librarian reset"]
  n_err["Display error"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_q
  n_q -->|"Yes"| n_mail
  n_q -->|"No"| n_staff
  n_staff --> n_e
  n_mail --> n_c
  n_c --> n_t
  n_t -->|"Yes"| n_save
  n_t -->|"No"| n_err
  n_err --> n_e
  n_save --> n_e
```

## 2.3.12 First-Login and Voluntary Password Change

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Change Password"]
  n_b[/"Enter current and new passwords"/]
  n_q{"Passwords valid?"}
  n_err["Display validation error"]
  n_save["Save new password"]
  n_revoke["Revoke old sessions"]
  n_next["Continue to account home"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_revoke
  n_revoke --> n_next
  n_next --> n_e
```

## 2.3.13 Profile Details and Optional Profile Photo

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Profile"]
  n_b[/"Choose contact or photo change"/]
  n_c["Keep verified name read-only"]
  n_d[/"Edit allowed fields or add/remove photo"/]
  n_q{"Change valid?"}
  n_err["Display error"]
  n_save["Save profile change"]
  n_show["Refresh profile display"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_d
  n_d --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_show
  n_show --> n_e
```

## 2.3.14 Email Change and Contact Verification

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open email settings"]
  n_b[/"Enter email and current password"/]
  n_c["Save email as unverified"]
  n_d["Request verification code"]
  n_input[/"Enter received code"/]
  n_q{"Code valid?"}
  n_err["Display verification error"]
  n_save["Mark email verified"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_d
  n_d --> n_input
  n_input --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_e
```

## 2.3.15 Reservation Queue, Pickup, Cancellation and Expiry

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Reservation confirmed"]
  n_q{"Available title capacity?"}
  n_ready["Mark ready for pickup"]
  n_wait["Add to waiting list"]
  n_free["Wait until capacity is available"]
  n_t{"Picked up within 24 hours?"}
  n_loan["Issue book and fulfill reservation"]
  n_cancel["Cancel or expire hold"]
  n_promote["Promote next waiting member"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_q
  n_q -->|"Yes"| n_ready
  n_q -->|"No"| n_wait
  n_wait --> n_free
  n_free --> n_ready
  n_ready --> n_t
  n_t -->|"Yes"| n_loan
  n_loan --> n_e
  n_t -->|"No"| n_cancel
  n_cancel --> n_promote
  n_promote --> n_e
```

## 2.3.16 Inventory Editing, Stock Adjustment and Title Deletion

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open librarian inventory"]
  n_b[/"Search and select book"/]
  n_c[/"Choose Edit, Cover or Delete"/]
  n_q{"Change allowed?"}
  n_err["Display stock or history restriction"]
  n_save["Save permitted changes"]
  n_copies["Keep copy identities and loan history"]
  n_show["Refresh inventory"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_copies
  n_copies --> n_show
  n_show --> n_e
```

## 2.3.17 ISBN Lookup and Workbook Book Import

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open book import tools"]
  n_b[/"Select ISBN list or XLSX file"/]
  n_c["Preview ISBN matches or validate workbook"]
  n_q{"Input valid?"}
  n_err["Show file or entry errors"]
  n_save["Add valid new books"]
  n_copy["Create physical copies and QR codes"]
  n_show["Show added, skipped and failed rows"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_copy
  n_copy --> n_show
  n_show --> n_e
```

## 2.3.18 Member Status, Password Reset and Account Removal

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Members"]
  n_b[/"Search and select member"/]
  n_c[/"Choose status, reset or deletion"/]
  n_q{"Action permitted?"}
  n_err["Show restriction"]
  n_save["Save account action"]
  n_show["Refresh member list"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_show
  n_show --> n_e
```

## 2.3.19 Librarian-Assisted Face Enrollment and Face Removal

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Select member Face ID controls"]
  n_q{"Remove Face ID?"}
  n_password[/"Confirm librarian password"/]
  n_remove["Delete permitted face data"]
  n_capture[/"Capture live face"/]
  n_r{"Live and unique face?"}
  n_err["Show enrollment error"]
  n_save["Save face enrollment"]
  n_show["Refresh enrollment status"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_q
  n_q -->|"Yes"| n_password
  n_password --> n_remove
  n_remove --> n_show
  n_q -->|"No"| n_capture
  n_capture --> n_r
  n_r -->|"No"| n_err
  n_err --> n_e
  n_r -->|"Yes"| n_save
  n_save --> n_show
  n_show --> n_e
```

## 2.3.20 Recommendations, Trending and Favorites

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open member Browse Books"]
  n_q{"Borrowing history exists?"}
  n_rec["Display recommendations"]
  n_trend["Display Trending"]
  n_other["Display What is new and Books we love"]
  n_select[/"Choose category or sort"/]
  n_heart[/"Add or remove a favorite"/]
  n_show["Refresh books and favorite status"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_q
  n_q -->|"Yes"| n_rec
  n_rec --> n_trend
  n_q -->|"No"| n_trend
  n_trend --> n_other
  n_other --> n_select
  n_select --> n_heart
  n_heart --> n_show
  n_show --> n_e
```

## 2.3.21 Reading Activity and Goals

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open member Dashboard"]
  n_b["Display borrowing, visits and reading goals"]
  n_q{"Update goals?"}
  n_input[/"Enter new targets"/]
  n_save["Save valid goals"]
  n_show["Refresh progress"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_q
  n_q -->|"No"| n_e
  n_q -->|"Yes"| n_input
  n_input --> n_save
  n_save --> n_show
  n_show --> n_e
```

## 2.3.22 Loan Issue Reports and In-App Notifications

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open own outstanding loan"]
  n_b[/"Select Report Issue"/]
  n_c[/"Choose reason and add note"/]
  n_q{"Loan belongs to member?"}
  n_err["Display error"]
  n_save["Create librarian notification"]
  n_staff["Librarian reviews issue"]
  n_read["Mark notification read"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_staff
  n_staff --> n_read
  n_read --> n_e
```

## 2.3.23 Physical-Copy QR Label Download and Bulk Export

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Print QR"]
  n_b[/"Search physical copies"/]
  n_c[/"Select one, selected or all matching copies"/]
  n_q{"Label selection valid?"}
  n_err["Display error"]
  n_file["Generate PNG, PDF or ZIP"]
  n_print["Print exact-copy labels"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_file
  n_file --> n_print
  n_print --> n_e
```

## 2.3.24 Appearance Settings and Entrance Station PIN Replacement

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Settings"]
  n_q{"Change station PIN?"}
  n_theme["Select Light or Dark mode"]
  n_input[/"Enter password and new PIN"/]
  n_t{"Password and PIN valid?"}
  n_err["Display error"]
  n_save["Save protected PIN"]
  n_unlock["Unlock station with new PIN"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_q
  n_q -->|"No"| n_theme
  n_theme --> n_e
  n_q -->|"Yes"| n_input
  n_input --> n_t
  n_t -->|"No"| n_err
  n_err --> n_e
  n_t -->|"Yes"| n_save
  n_save --> n_unlock
  n_unlock --> n_e
```

## 2.3.25 Acquisition Metadata Entry and Import

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open Reports: Acquisitions"]
  n_b[/"Enter copy ID or upload metadata"/]
  n_c["Review existing copy and details"]
  n_q{"Records valid and current?"}
  n_err["Show error and reload"]
  n_save["Confirm and save metadata"]
  n_show["Refresh acquisition report"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_q
  n_q -->|"No"| n_err
  n_err --> n_e
  n_q -->|"Yes"| n_save
  n_save --> n_show
  n_show --> n_e
```

## 2.3.26 Librarian Workspace, Dashboard and Navigation

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Open librarian dashboard"]
  n_b["View summaries and notices"]
  n_c[/"Open sidebar menu"/]
  n_d[/"Choose work area"/]
  n_open["Open selected librarian page"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_b
  n_b --> n_c
  n_c --> n_d
  n_d --> n_open
  n_open --> n_e
```

## 2.3.27 Safe Submission, Partial Results and Unknown Outcome Recovery

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["Review and submit operation"]
  n_q{"Result confirmed?"}
  n_keep["Keep original request and stop next items"]
  n_recover["Check or retry original request"]
  n_result["Display confirmed result"]
  n_next["Keep successful items and identify remaining items"]
  n_known{"Outcome now known?"}
  n_unknown["Keep request pending and seek assistance"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_q
  n_q -->|"No"| n_keep
  n_keep --> n_recover
  n_q -->|"Yes"| n_result
  n_result --> n_next
  n_next --> n_e
  n_recover --> n_known
  n_known -->|"Yes"| n_result
  n_known -->|"No"| n_unknown
  n_unknown --> n_e
```

## 2.3.28 Category Normalization and Librarian Review

```mermaid
flowchart TD
  n_s(["Start"])
  n_a["System reads book category"]
  n_q{"Category recognized?"}
  n_save["Save visible category"]
  n_hide["Keep unresolved book hidden"]
  n_review["Open Add Book category review"]
  n_choose[/"Choose supported category"/]
  n_apply["Save review resolution"]
  n_show["Refresh catalog category"]
  n_e(["End"])
  n_s --> n_a
  n_a --> n_q
  n_q -->|"Yes"| n_save
  n_save --> n_show
  n_q -->|"No"| n_hide
  n_hide --> n_review
  n_review --> n_choose
  n_choose --> n_apply
  n_apply --> n_show
  n_show --> n_e
```
