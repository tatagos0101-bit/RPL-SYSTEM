import ssl

import pytest

from services import otp_delivery as delivery


def test_smtp_requires_validated_tls_before_credentials(monkeypatch):
    for name, value in {"OTP_SMTP_HOST": "smtp.example.test", "OTP_SMTP_PORT": "587", "OTP_SMTP_USER": "synthetic",
                        "OTP_SMTP_PASSWORD": "synthetic-test-only", "OTP_EMAIL_FROM": "sender@example.test"}.items():
        monkeypatch.setenv(name, value)
    calls = []
    class SMTP:
        def __init__(self, host, port, timeout):
            assert (host, port, timeout) == ("smtp.example.test", 587, 10)
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def starttls(self, context):
            assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
            calls.append("tls")
        def login(self, *args):
            assert calls == ["tls"]
            calls.append("login")
        def send_message(self, mail):
            assert mail["To"] == "recipient@example.test"
            assert "123456" in mail.get_content()
            calls.append("send")
            return {}
    monkeypatch.setattr(delivery.smtplib, "SMTP", SMTP)
    delivery.send_code("email", "recipient@example.test", "123456", "verify")
    assert calls == ["tls", "login", "send"]



def test_sms_disabled_even_if_old_credentials_exist(monkeypatch):
    monkeypatch.setenv("OTP_TWILIO_ACCOUNT_SID", "synthetic")
    assert not delivery.configured("sms")
    with pytest.raises(delivery.DeliveryUnavailable):
        delivery.send_code("sms", "+639123456789", "123456", "reset")


@pytest.mark.parametrize("failure,retries", [(421, 3), (550, 1), (535, 1)])
def test_resend_retries_transient_failures_with_same_idempotency_key(monkeypatch, failure, retries):
    for name, value in {"OTP_SMTP_HOST": "smtp.resend.com", "OTP_SMTP_USER": "resend",
                        "OTP_SMTP_PASSWORD": "synthetic-test-only", "OTP_EMAIL_FROM": "sender@example.test"}.items():
        monkeypatch.setenv(name, value)
    keys = []
    class SMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def starttls(self, **kwargs): pass
        def login(self, *args): pass
        def send_message(self, mail):
            keys.append(mail["Resend-Idempotency-Key"])
            raise delivery.smtplib.SMTPDataError(failure, b"private provider detail")
    monkeypatch.setattr(delivery.smtplib, "SMTP", SMTP)
    monkeypatch.setattr(delivery.time, "sleep", lambda seconds: None)
    with pytest.raises(delivery.DeliveryUnavailable) as error:
        delivery.send_code("email", "recipient@example.test", "123456", "verify")
    assert len(keys) == retries and len(set(keys)) == 1
    assert not str(error.value)
