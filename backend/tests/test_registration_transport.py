import ssl
import httpx
import pytest
from services import otp_delivery


@pytest.fixture()
def configured_email(monkeypatch):
    for name, value in {"OTP_SMTP_HOST": "smtp.example.test", "OTP_SMTP_USER": "synthetic", "OTP_SMTP_PASSWORD": "synthetic-only", "OTP_EMAIL_FROM": "library@example.test"}.items():
        monkeypatch.setenv(name, value)


@pytest.fixture()
def configured_sms(monkeypatch):
    for name, value in {"REGISTRATION_SMS_PROVIDER": "twilio", "REGISTRATION_TWILIO_ACCOUNT_SID": "AC" + "a" * 32,
                        "REGISTRATION_TWILIO_AUTH_TOKEN": "synthetic-only", "REGISTRATION_TWILIO_FROM": "+14155550123"}.items():
        monkeypatch.setenv(name, value)


def credentials(**extra):
    return {"member_id": "RPL-SAMPLE", "temporary_password": "Sample123X", "email": None, "phone": None, **extra}


def test_registration_email_uses_tls_existing_settings_and_one_attempt(monkeypatch, configured_email):
    from services import registration_delivery as delivery
    calls = []
    class SMTP:
        def __init__(self, host, port, timeout):
            assert host == "smtp.example.test" and port == 587 and timeout == 5
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def starttls(self, context):
            assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
            calls.append("tls")
        def login(self, *args):
            assert calls == ["tls"]
            calls.append("login")
        def send_message(self, mail):
            assert "RPL-SAMPLE" in mail.get_content() and "Sample123X" in mail.get_content()
            assert "change" in mail.get_content().lower()
            assert mail["To"] == "reader@example.test"
            assert mail["Resend-Idempotency-Key"].startswith("rpl-registration/")
            assert "verification code" not in mail["Subject"].lower()
            calls.append("send")
            return {}
    monkeypatch.setattr(otp_delivery.smtplib, "SMTP", SMTP)
    assert delivery.deliver_registration_credentials(**credentials(email="reader@example.test", phone="09123456789")) == {"channel": "email", "status": "accepted"}
    assert calls == ["tls", "login", "send"]


def test_email_precedes_phone_and_a_failed_email_does_not_switch_contacts(monkeypatch, configured_email):
    from services import registration_delivery as delivery
    calls = []
    def fail(**values):
        calls.append("email")
        raise otp_delivery.DeliveryUnavailable("synthetic private error")
    monkeypatch.setattr(delivery, "send_registration_email", fail)
    monkeypatch.setattr(delivery, "send_registration_sms", lambda **values: calls.append("sms"))
    assert delivery.deliver_registration_credentials(**credentials(email="reader@example.test", phone="09123456789")) == {"channel": "email", "status": "failed"}
    assert calls == ["email"]


def test_unconfigured_transport_and_no_contact_have_explicit_handoff(monkeypatch):
    from services import registration_delivery as delivery
    assert delivery.deliver_registration_credentials(**credentials(email="reader@example.test")) == {"channel": "email", "status": "unavailable"}
    assert delivery.deliver_registration_credentials(**credentials(phone="09123456789")) == {"channel": "sms", "status": "unavailable"}
    assert delivery.deliver_registration_credentials(**credentials()) == {"channel": "librarian", "status": "manual"}


@pytest.mark.parametrize("phone,expected", [("0912 345 6789", "+639123456789"), ("639123456789", "+639123456789"), ("9123456789", "+639123456789"), ("+63 (912) 345-6789", "+639123456789"), ("+14155550123", "+14155550123")])
def test_sms_uses_normalized_phone_and_validated_twilio_acceptance(monkeypatch, configured_sms, phone, expected):
    from services import registration_delivery as delivery
    calls = []
    def post(url, **kwargs):
        calls.append(url)
        assert url == "https://api.twilio.com/2010-04-01/Accounts/AC" + "a" * 32 + "/Messages.json"
        assert kwargs["auth"] == ("AC" + "a" * 32, "synthetic-only")
        assert kwargs["data"]["To"] == expected and kwargs["data"]["From"] == "+14155550123"
        assert "Sample123X" in kwargs["data"]["Body"] and "RPL-SAMPLE" in kwargs["data"]["Body"]
        assert kwargs["timeout"] == 10 and kwargs["follow_redirects"] is False
        return httpx.Response(201, json={"sid": "SM" + "b" * 32, "status": "queued"})
    monkeypatch.setattr(delivery.httpx, "post", post)
    assert delivery.deliver_registration_credentials(**credentials(phone=phone)) == {"channel": "sms", "status": "accepted"}
    assert len(calls) == 1


@pytest.mark.parametrize("response", [(201, {}), (201, {"sid": "SM" + "b" * 32, "status": "failed"}), (400, {"message": "private provider rejection"}), (302, {})])
def test_sms_rejection_is_not_reported_sent_or_retried(monkeypatch, configured_sms, response):
    from services import registration_delivery as delivery
    calls = []
    def post(*args, **kwargs):
        calls.append(True)
        return httpx.Response(response[0], json=response[1])
    monkeypatch.setattr(delivery.httpx, "post", post)
    result = delivery.deliver_registration_credentials(**credentials(phone="09123456789"))
    assert result == {"channel": "sms", "status": "failed"} and len(calls) == 1


def test_unknown_sms_failure_is_sanitized_and_not_retried(monkeypatch, configured_sms, caplog):
    from services import registration_delivery as delivery
    calls = []
    def post(*args, **kwargs):
        calls.append(True)
        raise httpx.ReadTimeout("private synthetic provider data Sample123X")
    monkeypatch.setattr(delivery.httpx, "post", post)
    assert delivery.deliver_registration_credentials(**credentials(phone="09123456789")) == {"channel": "sms", "status": "failed"}
    assert len(calls) == 1 and "Sample123X" not in caplog.text and "private synthetic" not in caplog.text


@pytest.mark.parametrize("phone", ["not a phone", "+00000000000", "0912abc6789", "123"])
def test_invalid_sms_destinations_never_make_a_request(monkeypatch, configured_sms, phone):
    from services import registration_delivery as delivery
    def unexpected(*args, **kwargs): raise AssertionError("No SMS request should occur")
    monkeypatch.setattr(delivery.httpx, "post", unexpected)
    assert delivery.deliver_registration_credentials(**credentials(phone=phone)) == {"channel": "sms", "status": "failed"}


def test_uncertain_registration_email_does_not_retry(monkeypatch, configured_email, caplog):
    from services import registration_delivery as delivery
    monkeypatch.setenv("OTP_SMTP_HOST", "smtp.resend.com")
    calls = []
    class SMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def starttls(self, **kwargs): pass
        def login(self, *args): pass
        def send_message(self, mail):
            calls.append(True)
            raise otp_delivery.smtplib.SMTPServerDisconnected("synthetic private Sample123X")
    monkeypatch.setattr(otp_delivery.smtplib, "SMTP", SMTP)
    assert delivery.deliver_registration_credentials(**credentials(email="reader@example.test")) == {"channel": "email", "status": "failed"}
    assert len(calls) == 1 and "Sample123X" not in caplog.text
