# Public Catalog Reservation Design

## Goal
Members who choose a book from the public catalog should land on their reservation page with that book already in "My Selection" after login, then confirm the reservation without searching again.

## Reservation Rules
- Available books can be selected and confirmed as `ready` reservations.
- Unavailable books can still be selected and confirmed as `pending` reservations.
- Unavailable-book copy should say the book is currently not available and the member will join the reservation queue until it is their turn.
- Duplicate active reservations for the same member and book remain blocked by the backend.
- The 24-hour pickup countdown starts only when a reservation is `ready`.
- Expired `ready` reservations are automatically changed to `cancelled`.
- When an expired or manually cancelled `ready` reservation frees an available copy, the next pending member for that book is promoted to `ready`.

## Frontend Flow
- Public catalog "Login to Reserve" links to `/user/login?next=/user/reservations?reserveBook=<book_id>`.
- After member login, the existing safe-next handling sends the user to `/user/reservations?reserveBook=<book_id>`.
- `UserReservations` reads `reserveBook`, fetches the public book details, and adds the book to the existing `rp_cart` selection if it is not already selected.
- The member confirms from "My Selection"; the backend creates the real reservation at that point.
- `UserBrowseBooks` no longer blocks unavailable books from being added to selection. Its buttons and messages distinguish available reservations from queued reservations.

## Backend Flow
- Add a small reservation policy service that cancels expired `ready` reservations, promotes the next pending member when a copy is available, and renumbers pending queues when needed.
- Run the expiry sync before member reservation lists, librarian reservation lists, member reservation lookup during borrow flow, and borrow/return operations.
- Keep existing reservation statuses: `pending`, `ready`, `cancelled`, `fulfilled`.

## Testing
- Backend tests cover unavailable-book reservation as pending, available-book reservation as ready with expiry, and expired ready reservations disappearing from active lists after auto-cancel.
- Frontend node tests cover converting a public-catalog book into a reservation selection and preserving duplicate protection.
