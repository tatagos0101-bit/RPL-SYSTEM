"""Server-only email OTP transport. Never log destinations, codes or provider responses."""
import os
import smtplib
import ssl
import time
import uuid
from email.message import EmailMessage


class DeliveryUnavailable(Exception):
    pass


def configured(channel):
    return channel == "email" and all(os.getenv(name, "").strip() for name in (
        "OTP_SMTP_HOST", "OTP_SMTP_USER", "OTP_SMTP_PASSWORD", "OTP_EMAIL_FROM"))


def send_code(channel, destination, code, purpose):
    if not configured(channel):
        raise DeliveryUnavailable()
    action = "verify your email" if purpose == "verify" else "reset your password"
    try:
        mail = EmailMessage()
        mail["From"] = os.environ["OTP_EMAIL_FROM"]
        mail["To"] = destination
        mail["Subject"] = "RPL verification code"
        # Stable for retries of this send, unique for each new code attempt.
        mail["Resend-Idempotency-Key"] = "rpl-otp/" + uuid.uuid4().hex
        mail.set_content(f"Rizal Provincial Library: {code} is your code to {action}. Expires in 15 minutes. Do not share this code.")
        is_resend = os.environ["OTP_SMTP_HOST"].strip().lower() == "smtp.resend.com"
        for attempt in range(3):
            try:
                # STARTTLS is mandatory, before credentials. No SMTP debug logging.
                with smtplib.SMTP(os.environ["OTP_SMTP_HOST"], int(os.getenv("OTP_SMTP_PORT", "587")), timeout=10) as smtp:
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.login(os.environ["OTP_SMTP_USER"], os.environ["OTP_SMTP_PASSWORD"])
                    if smtp.send_message(mail):
                        raise DeliveryUnavailable()
                return
            except (smtplib.SMTPException, OSError) as exc:
                # SMTP 4xx are transient (unlike HTTP 4xx). Never retry auth/TLS
                # failures. Only Resend retries uncertain sends: it deduplicates.
                transient = (isinstance(exc, (smtplib.SMTPServerDisconnected, TimeoutError, ConnectionError))
                             or isinstance(exc, smtplib.SMTPResponseException) and 400 <= exc.smtp_code < 500)
                if (not is_resend or not transient or attempt == 2
                        or isinstance(exc, (smtplib.SMTPAuthenticationError, ssl.SSLError))):
                    raise
                time.sleep(2 ** attempt)
    except Exception:
        # Exceptions may contain credentials, recipients or message content.
        raise DeliveryUnavailable() from None
