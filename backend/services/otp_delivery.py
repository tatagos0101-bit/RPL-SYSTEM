"""Server-only email OTP transport. Never log destinations, codes or provider responses."""
import os
import smtplib
import ssl
import time
import uuid
from email.message import EmailMessage


class DeliveryUnavailable(Exception):
    pass


class DeliveryUncertain(DeliveryUnavailable):
    """Transport ended without a definitive provider acknowledgement."""


def configured(channel):
    return channel == "email" and all(os.getenv(name, "").strip() for name in (
        "OTP_SMTP_HOST", "OTP_SMTP_USER", "OTP_SMTP_PASSWORD", "OTP_EMAIL_FROM"))


def send_email(destination, subject, content, *, idempotency_prefix="rpl-otp", timeout=10, max_attempts=3):
    if not configured("email"):
        raise DeliveryUnavailable()
    try:
        mail = EmailMessage()
        mail["From"] = os.environ["OTP_EMAIL_FROM"]
        mail["To"] = destination
        mail["Subject"] = subject
        # Stable for retries of this send, unique for each new message.
        mail["Resend-Idempotency-Key"] = idempotency_prefix + "/" + uuid.uuid4().hex
        mail.set_content(content)
        is_resend = os.environ["OTP_SMTP_HOST"].strip().lower() == "smtp.resend.com"
        for attempt in range(max_attempts):
            try:
                # STARTTLS is mandatory, before credentials. No SMTP debug logging.
                with smtplib.SMTP(os.environ["OTP_SMTP_HOST"], int(os.getenv("OTP_SMTP_PORT", "587")), timeout=timeout) as smtp:
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.login(os.environ["OTP_SMTP_USER"], os.environ["OTP_SMTP_PASSWORD"])
                    if smtp.send_message(mail):
                        raise DeliveryUnavailable()
                return
            except (smtplib.SMTPException, OSError) as exc:
                # Only Resend retries uncertain sends, using its deduplication key.
                transient = (isinstance(exc, (smtplib.SMTPServerDisconnected, TimeoutError, ConnectionError))
                             or isinstance(exc, smtplib.SMTPResponseException) and 400 <= exc.smtp_code < 500)
                if (not is_resend or not transient or attempt == max_attempts - 1
                        or isinstance(exc, (smtplib.SMTPAuthenticationError, ssl.SSLError))):
                    raise
                time.sleep(2 ** attempt)
    except (smtplib.SMTPServerDisconnected, TimeoutError, ConnectionError):
        raise DeliveryUncertain() from None
    except Exception:
        # Exceptions may contain credentials, recipients or message content.
        raise DeliveryUnavailable() from None


def send_code(channel, destination, code, purpose):
    from services.password_reset import RESET_CODE_MINUTES, CONTACT_CODE_MINUTES
    minutes = RESET_CODE_MINUTES if purpose == "reset" else CONTACT_CODE_MINUTES
    # Email is the only supported delivery channel.
    if channel != "email":
        raise DeliveryUnavailable()
    action = "verify your email" if purpose == "verify" else "reset your password"
    send_email(destination, "RPL verification code",
               f"Rizal Provincial Library: {code} is your code to {action}. Expires in {minutes} minutes. Do not share this code.")
