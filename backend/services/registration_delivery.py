"""Registration-only credential handoff; never log or persist message contents."""
import os
import re

import httpx

from services import otp_delivery

_E164 = re.compile(r"\+[1-9]\d{6,14}\Z")
_ACCOUNT_SID = re.compile(r"AC[0-9a-fA-F]{32}\Z")
_MESSAGE_SID = re.compile(r"SM[0-9a-fA-F]{32}\Z")


def normalize_sms_phone(value):
    value = (value or "").strip()
    if not re.fullmatch(r"[+\d\s()\-]+", value):
        raise ValueError("Invalid SMS destination")
    value = re.sub(r"[\s()\-]", "", value)
    if re.fullmatch(r"09\d{9}", value):
        value = "+63" + value[1:]
    elif re.fullmatch(r"9\d{9}", value):
        value = "+63" + value
    elif re.fullmatch(r"639\d{9}", value):
        value = "+" + value
    if not _E164.fullmatch(value):
        raise ValueError("Invalid SMS destination")
    return value


def sms_configured():
    return (os.getenv("REGISTRATION_SMS_PROVIDER", "").strip().lower() == "twilio"
            and bool(_ACCOUNT_SID.fullmatch(os.getenv("REGISTRATION_TWILIO_ACCOUNT_SID", "").strip()))
            and bool(os.getenv("REGISTRATION_TWILIO_AUTH_TOKEN", "").strip())
            and bool(_E164.fullmatch(os.getenv("REGISTRATION_TWILIO_FROM", "").strip())))


def send_registration_email(*, destination, member_id, temporary_password):
    otp_delivery.send_email(destination, "Your Rizal Provincial Library account",
        f"Your library account is ready.\n\nMember ID: {member_id}\nTemporary password: {temporary_password}\n\n"
        "This temporary password expires 24 hours after it was issued. Sign in with your Member ID and change it before continuing. Keep it private.",
        idempotency_prefix="rpl-registration", timeout=5, max_attempts=1)


def send_registration_sms(*, destination, member_id, temporary_password):
    send_sms(destination, f"RPL account ready. Member ID: {member_id}. Temporary password: {temporary_password}. "
             "Expires 24 hours after issue. Sign in with your Member ID and change it at first login. Keep it private.")


def send_sms(destination, message, *, timeout=10):
    if not sms_configured():
        raise otp_delivery.DeliveryUnavailable()
    destination = normalize_sms_phone(destination)
    account = os.environ["REGISTRATION_TWILIO_ACCOUNT_SID"].strip()
    response = httpx.post(f"https://api.twilio.com/2010-04-01/Accounts/{account}/Messages.json",
        auth=(account, os.environ["REGISTRATION_TWILIO_AUTH_TOKEN"].strip()),
        data={"To": destination, "From": os.environ["REGISTRATION_TWILIO_FROM"].strip(),
              "Body": message},
        timeout=timeout, follow_redirects=False)
    if response.status_code != 201:
        raise otp_delivery.DeliveryUnavailable()
    try:
        result = response.json()
    except ValueError:
        raise otp_delivery.DeliveryUncertain() from None
    if (not isinstance(result, dict) or not _MESSAGE_SID.fullmatch(str(result.get("sid", "")))
            or result.get("status") not in {"queued", "accepted", "sending", "sent", "delivered"}):
        raise otp_delivery.DeliveryUncertain()


def deliver_registration_credentials(*, member_id, temporary_password, email=None, phone=None):
    channel = "email" if email else "sms" if phone else "librarian"
    if channel == "librarian":
        return {"channel": channel, "status": "manual"}
    if not (otp_delivery.configured("email") if channel == "email" else sms_configured()):
        return {"channel": channel, "status": "unavailable"}
    try:
        send = send_registration_email if channel == "email" else send_registration_sms
        send(destination=email if channel == "email" else phone,
             member_id=member_id, temporary_password=temporary_password)
    except Exception:
        # Unknown transport outcomes use the same password for staff handoff.
        # Never expose an exception/provider body, retry SMS or switch contacts.
        return {"channel": channel, "status": "failed"}
    return {"channel": channel, "status": "accepted"}
