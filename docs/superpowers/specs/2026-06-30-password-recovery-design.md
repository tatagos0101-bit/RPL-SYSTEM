# Password Recovery Design

## Goal
Members need a practical way to recover accounts using their email or phone when available, while still supporting members who have no email address or cellphone.

## Scope
- Add contact verification flags to member records: `email_verified` and `phone_verified`.
- Librarian-assisted registration may mark provided contacts as usable for password reset.
- Add a member forgot-password flow that generates a short-lived reset code for a verified email or phone.
- In development, return the reset code in the API response so the local system can be tested without an email/SMS provider.
- In production, do not return the reset code; the same service boundary can later send it through email/SMS.
- Add librarian-assisted password reset for members with no recovery contact or failed self-service recovery.

## Rules
- Members can still exist without email or phone.
- Members without verified email or phone recover their account in person through a librarian.
- Librarian reset generates a unique temporary password and sets `must_change_password = true`.
- Self-service reset requires a valid reset code and sets the chosen new password directly.
- Reset request responses avoid revealing password hashes or existing passwords.

## User Experience
- Member login page includes "Forgot password?".
- Forgot-password page accepts email, phone number, or Member ID.
- If a verified channel exists, the system shows where the code was prepared. In development, it also shows the code.
- If no verified channel exists, the page tells the member to visit the librarian with their ID/member card.
- Librarian member list includes a reset-password action that shows a temporary password for the selected member.

## Future Provider Integration
- Email sending can later be wired to SMTP/SendGrid/Mailgun.
- SMS sending can later be wired to Twilio/Semaphore/other Philippine SMS providers.
- Google account linking should be a separate phase because Google OAuth needs credentials and should not be treated as a generic address source.
