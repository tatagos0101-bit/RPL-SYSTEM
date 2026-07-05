# Public Catalog Reservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect public catalog reserve intent to the member reservation selection and allow unavailable books to join a queue with 24-hour auto-cancel once ready.

**Architecture:** Reuse the existing `rp_cart` "My Selection" model instead of adding a new reservation state. Add focused frontend helpers for cart insertion and backend reservation policy helpers for expiry/queue maintenance.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, Vite, Node `node:test`.

## Global Constraints

- Public catalog reserve intent must create only a pending local selection before the member confirms.
- Available confirmed reservations become `ready` and receive `expires_at`.
- Unavailable confirmed reservations become `pending` and remain reservable.
- Expired `ready` reservations become `cancelled`.
- Expired or manually cancelled `ready` reservations promote the next pending member when a copy is available.
- Use existing statuses: `pending`, `ready`, `cancelled`, `fulfilled`.
- Do not introduce external schedulers; run expiry sync from API entry points.

---

### Task 1: Backend Reservation Policy

**Files:**
- Create: `backend/services/reservation_policy.py`
- Modify: `backend/routers/reservations.py`
- Modify: `backend/routers/librarian.py`
- Modify: `backend/routers/transactions.py`
- Test: `backend/tests/test_reservation_policy.py`

**Interfaces:**
- Produces: `sync_expired_reservations(db: Session, book_id: int | None = None, user_id: int | None = None) -> int`
- Produces: `renumber_pending_queue(db: Session, book_id: int) -> None`
- Produces: `promote_next_pending_reservation(db: Session, book_id: int) -> Reservation | None`
- Consumes: existing `Reservation`, `Book`, `Notification`, and `PICKUP_WINDOW_HOURS`.

- [ ] **Step 1: Write failing backend tests**
  - Test unavailable books can be reserved as `pending`.
  - Test available books become `ready` and have `expires_at`.
  - Test expired ready reservations are auto-cancelled before active lists are returned.
  - Test the next pending reservation is promoted when an expired ready reservation frees an available copy.

- [ ] **Step 2: Run backend reservation tests and verify failure**
  - Run: `pytest backend/tests/test_reservation_policy.py -q`
  - Expected: failure because the new policy module and expiry behavior do not exist yet.

- [ ] **Step 3: Implement reservation policy service**
  - Add `sync_expired_reservations` to cancel `ready` reservations where `expires_at <= now_ph()`.
  - Add `promote_next_pending_reservation` to mark the next pending reservation as `ready` when a copy is available.
  - Add `renumber_pending_queue` to keep pending queue positions contiguous for a book.

- [ ] **Step 4: Call policy from API entry points**
  - Call expiry sync in member reservation list, librarian reservation list, member reservation lookup, borrow, and return flows.
  - Replace duplicate queue renumbering blocks with the shared helper where practical.

- [ ] **Step 5: Run backend tests**
  - Run: `pytest backend/tests/test_reservation_policy.py -q`
  - Expected: all tests pass.

### Task 2: Frontend Public Catalog Selection

**Files:**
- Create: `frontend/src/api/reservationCart.js`
- Modify: `frontend/src/pages/public/PublicBrowse.jsx`
- Modify: `frontend/src/pages/user/UserReservations.jsx`
- Modify: `frontend/src/pages/user/UserBrowseBooks.jsx`
- Test: `frontend/src/api/reservationCart.test.js`

**Interfaces:**
- Produces: `bookToReservationCartItem(book: object) -> object`
- Produces: `addReservationCartItem(items: object[], book: object) -> { items: object[], added: boolean }`
- Consumes: existing `getBook(id)` API and `rp_cart` localStorage key.

- [ ] **Step 1: Write failing frontend helper tests**
  - Test the helper maps public book data into the same cart item shape used by "My Selection".
  - Test duplicate book IDs are not inserted twice.

- [ ] **Step 2: Run frontend helper test and verify failure**
  - Run: `node --test frontend/src/api/reservationCart.test.js`
  - Expected: failure because the helper does not exist yet.

- [ ] **Step 3: Implement reservation cart helper**
  - Add the mapping and duplicate-safe insertion functions.

- [ ] **Step 4: Wire public catalog login intent**
  - Change "Login to Reserve" to link to `/user/login?next=/user/reservations?reserveBook=<book_id>`.
  - Update modal copy so unavailable books are still reservable and described as queue reservations.

- [ ] **Step 5: Wire member pages**
  - `UserReservations` reads `reserveBook`, fetches that book, inserts it into `rp_cart`, removes the query param with `replace`, and shows it in "My Selection".
  - `UserBrowseBooks` permits unavailable books to be added to selection and changes CTA/copy to queue language.

- [ ] **Step 6: Run frontend tests**
  - Run: `node --test frontend/src/api/reservationCart.test.js frontend/src/api/authRoutes.test.js frontend/src/api/librarianNavigation.test.js frontend/src/api/memberSearch.test.js`
  - Expected: all tests pass.

### Task 3: Full Verification

**Files:**
- Verify: backend and frontend test/build commands.

**Interfaces:**
- Consumes: Task 1 and Task 2 outputs.

- [ ] **Step 1: Run backend test suite**
  - Run: `pytest backend/tests -q`
  - Expected: all tests pass.

- [ ] **Step 2: Run frontend lint**
  - Run: `npm.cmd run lint`
  - Expected: lint exits with code 0.

- [ ] **Step 3: Run frontend node tests**
  - Run: `node --test src/api/authRoutes.test.js src/api/librarianNavigation.test.js src/api/memberSearch.test.js src/api/reservationCart.test.js`
  - Expected: all tests pass.

- [ ] **Step 4: Run frontend build**
  - Run: `npm.cmd run build`
  - Expected: build exits with code 0.
