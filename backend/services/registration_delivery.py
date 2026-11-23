"""Registration-only credential handoff; never log or persist message contents."""
from services import otp_delivery


def send_registration_email(*, destination, member_id, temporary_password):
    otp_delivery.send_email(destination, "Your Rizal Provincial Library account",
        f"Your library account is ready.\n\nMember ID: {member_id}\nTemporary password: {temporary_password}\n\n"
        "This temporary password expires 24 hours after it was issued. Sign in with your Member ID and change it before continuing. Keep it private.",
        idempotency_prefix="rpl-registration", timeout=5, max_attempts=1)


def deliver_registration_credentials(*, member_id, temporary_password, email=None, phone=None):
    # Legacy callers may still pass phone; credentials never use a paid SMS path.
    channel = "email" if email else "librarian"
    if channel == "librarian":
        return {"channel": channel, "status": "manual"}
    if not otp_delivery.configured("email"):
        return {"channel": channel, "status": "unavailable"}
    try:
        send_registration_email(destination=email, member_id=member_id, temporary_password=temporary_password)
    except Exception:
        # Unknown transport outcomes use the same password for staff handoff.
        # Never expose an exception/provider body or switch delivery channels.
        return {"channel": channel, "status": "failed"}
    return {"channel": channel, "status": "accepted"}
