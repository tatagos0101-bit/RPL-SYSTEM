"""Fictional TIN layouts only. No real tax numbers, IDs or portraits."""
import io

from fastapi import HTTPException
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import pytest

from models.user import User
from services import identity_documents as ids
from services.passwords import hash_password


TIN_LINES = [
    "REPUBLIC OF THE PHILIPPINES", "DEPARTMENT OF FINANCE",
    "BUREAU OF INTERNAL REVENUE", "TAXPAYER IDENTIFICATION NUMBER",
    "123-456-789-000", "SYNTHETIC TEST PERSON",
    "ADDRESS: 42 READING LANE, TEST TOWN", "DATE OF ISSUE: 2010-01-01",
    "BIR FORM NO. 1931",
]


@pytest.mark.parametrize("heading,number,label", [
    ("TAXPAYER IDENTIFICATION NUMBER", "123-456-789-000", "SYNTHETIC TEST PERSON"),
    ("TAX IDENTIFICATION NUMBER", "123-456-789", "SYNTHETIC TEST PERSON"),
    ("DIGITAL TIN ID", "123456789", "FULL NAME: SYNTHETIC TEST PERSON"),
    ("TIN ID", "123 456 789 000", "NAME: SYNTHETIC TEST PERSON"),
    ("TAXPAYER IDENTIFICATION CARD", "123\u2013456\u2013789", "TAXPAYER'S NAME: SYNTHETIC TEST PERSON"),
])
def test_physical_and_digital_tin_layouts(heading, number, label):
    lines = [*TIN_LINES[:3], heading, number, label, *TIN_LINES[6:]]
    assert ids.classify_document(lines) == "tin_id"
    name, address = ids.suggested_fields(lines, document_type="tin_id")
    assert name == "SYNTHETIC TEST PERSON"
    assert address == "42 READING LANE, TEST TOWN"
    assert number not in (name, address)


@pytest.mark.parametrize("wrong_document", [
    "BIR FORM NO. 2303", "BIR FORM 1904", "CERTIFICATE OF REGISTRATION",
    "OFFICIAL RECEIPT", "SALES INVOICE", "TAX RETURN", "TAX CLEARANCE",
])
def test_tax_documents_with_tin_and_name_are_not_photo_ids(wrong_document):
    with pytest.raises(HTTPException) as failure:
        ids.classify_document([*TIN_LINES, wrong_document])
    assert failure.value.status_code == 422
    assert "not a BIR tax form" in failure.value.detail


def test_tin_needs_readable_issuer_number_and_holder_information():
    variants = (
        [line for line in TIN_LINES if line != "BUREAU OF INTERNAL REVENUE" and line != "BIR FORM NO. 1931"],
        [line.replace("123-456-789-000", "1234") for line in TIN_LINES],
        [line for line in TIN_LINES if line != "SYNTHETIC TEST PERSON"],
    )
    for lines in variants:
        with pytest.raises(HTTPException) as failure:
            ids.classify_document(lines)
        assert failure.value.status_code == 422


def test_tin_unlabeled_name_exception_does_not_relax_other_id_types():
    with pytest.raises(HTTPException):
        ids.classify_document(["REPUBLIC OF THE PHILIPPINES", "PHILIPPINE IDENTIFICATION CARD",
            "SYNTHETIC TEST PERSON", "ADDRESS: 42 READING LANE, TEST TOWN"])


def test_ambiguous_unlabeled_tin_names_need_manual_review():
    lines = [*TIN_LINES, "SECOND SYNTHETIC PERSON"]
    assert ids.classify_document(lines) == "tin_id"
    assert ids.suggested_fields(lines, document_type="tin_id") == (None, "42 READING LANE, TEST TOWN")


def test_tin_ocr_can_join_words_without_losing_the_issuer_check():
    lines = [line.replace("BUREAU OF INTERNAL REVENUE", "BUREAUOFINTERNALREVENUE").replace(
        "TAXPAYER IDENTIFICATION NUMBER", "TAXPAYERIDENTIFICATIONNUMBER") for line in TIN_LINES]
    assert ids.classify_document(lines) == "tin_id"


def test_tin_unreadable_fields_get_specific_errors():
    for missing, expected in (("SYNTHETIC TEST PERSON", "holder's name"), ("123-456-789-000", "printed number")):
        with pytest.raises(HTTPException) as failure:
            ids.classify_document([line for line in TIN_LINES if line != missing])
        assert failure.value.status_code == 422 and expected in failure.value.detail


@pytest.mark.parametrize("invalid_marking", ["SPECIMEN", "NOT VALID", "EXPIRY: 2020-01-01"])
def test_tin_support_keeps_invalid_and_expired_document_rejections(invalid_marking):
    with pytest.raises(HTTPException) as failure:
        ids.classify_document([*TIN_LINES, invalid_marking])
    assert failure.value.status_code == 422


@pytest.mark.parametrize("kind,heading", [
    ("national_id", "PHILIPPINE IDENTIFICATION CARD"),
    ("drivers_license", "LAND TRANSPORTATION OFFICE DRIVER'S LICENSE"),
    ("passport", "PASSPORT"), ("umid", "UNIFIED MULTI-PURPOSE ID"),
    ("prc", "PROFESSIONAL REGULATION COMMISSION"), ("postal_id", "PHILIPPINE POSTAL CORPORATION"),
    ("sss", "SOCIAL SECURITY SYSTEM"), ("gsis", "GOVERNMENT SERVICE INSURANCE SYSTEM"),
    ("voters_id", "COMMISSION ON ELECTIONS"), ("senior_citizen", "SENIOR CITIZEN"),
    ("pwd", "PERSON WITH DISABILITY"),
])
def test_existing_document_types_remain_supported(kind, heading):
    assert ids.classify_document([heading, "FULL NAME: SYNTHETIC TEST PERSON",
        "ADDRESS: 42 READING LANE, TEST TOWN"]) == kind


def test_tin_still_requires_a_portrait(monkeypatch):
    stream = io.BytesIO()
    Image.new("RGB", (1000, 600), "#e3eee4").save(stream, "PNG")
    monkeypatch.setattr(ids, "read_id_text", lambda rgb: TIN_LINES)
    monkeypatch.setattr("services.face_engine_service.detect_faces", lambda *args, **kwargs: [])
    with pytest.raises(HTTPException) as failure:
        ids.inspect_document(stream.getvalue())
    assert failure.value.status_code == 422 and "portrait" in failure.value.detail


def test_real_ocr_reads_synthetic_tin_without_name_label():
    image = Image.new("RGB", (1300, 900), "#e3eee4")
    draw, font = ImageDraw.Draw(image), ImageFont.load_default(size=30)
    for index, value in enumerate(TIN_LINES):
        draw.text((30, 30 + index * 80), value, font=font, fill="#162818")
    lines = ids.read_id_text(np.array(image))
    assert ids.classify_document(lines) == "tin_id"
    assert ids.suggested_fields(lines, document_type="tin_id") == ("SYNTHETIC TEST PERSON", "42 READING LANE, TEST TOWN")


def test_librarian_tin_inspection_returns_suggestions_without_tax_number(client, db_session, monkeypatch):
    actor = User(name="Synthetic Librarian", email="tin-staff@example.test", role="librarian",
        password_hash=hash_password("Password1"))
    db_session.add(actor); db_session.commit()
    assert client.post("/api/auth/login", json={"email": actor.email, "password": "Password1"}).status_code == 200
    monkeypatch.setattr(ids, "read_id_text", lambda rgb: TIN_LINES)
    monkeypatch.setattr(ids, "document_face", lambda image: {"engine": "dlib", "encoding": [0.0] * 128})
    stream = io.BytesIO(); Image.new("RGB", (1000, 600), "#e3eee4").save(stream, "PNG")
    result = client.post("/api/librarian/identity/inspect", files={"id_image": ("synthetic-tin.png", stream.getvalue(), "image/png")})
    assert result.status_code == 200
    assert result.json()["document_type"] == "tin_id"
    assert result.json()["suggested_name"] == "SYNTHETIC TEST PERSON"
    assert result.json()["suggested_location"] == "42 READING LANE, TEST TOWN"
    assert "123-456-789" not in result.text
    assert result.headers["cache-control"] == "no-store"
