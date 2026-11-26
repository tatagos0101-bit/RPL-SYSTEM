"""Synthetic online enrollment; no real IDs, faces, or camera-accuracy claims."""
import json

import pytest

from models.face_embedding import FaceEmbedding
from models.security_alert import SecurityAlert
from services import face_engine_service as engine
from services import identity_documents as ids
from services.face_enrollment_consent import FACE_CONSENT_VERSION
from tests.test_identity_documents import account, face, mock_live, setup_verified, sign_in
from timezone_utils import now_ph


def payload(**extra):
    return {"image": "synthetic-live-camera", "accept_face_recognition": True,
        "face_consent_version": FACE_CONSENT_VERSION, **extra}


def test_signed_in_member_enrolls_without_upload_or_verified_id(client, db_session, monkeypatch):
    member = account(db_session)
    sign_in(client, member); mock_live(monkeypatch)
    def forbidden(*args, **kwargs):
        pytest.fail("Online enrollment must not inspect or compare an ID")
    monkeypatch.setattr(ids, "verify_remote_identity", forbidden)
    monkeypatch.setattr(ids, "_checked_id_pair", forbidden)
    monkeypatch.setattr(ids, "inspect_document", forbidden)
    profile = client.get('/api/user/profile').json()
    assert profile['remote_face_enrollment_allowed'] and not profile['identity_verified']
    assert profile['remote_face_verification_method'] == 'account_session'
    result = client.post('/api/auth/enroll-face', json=payload())
    assert result.status_code == 200 and result.json()['enrollment_changed'] is True
    assert result.json()['verification_method'] == 'account_session'
    db_session.refresh(member)
    assert json.loads(member.face_encoding) == [0.0] * 128
    assert member.id_image_url is None and member.id_verified_at is None
    assert member.face_id_verified_at is None
    assert member.face_consent_method == 'self'
    assert member.face_consent_version == FACE_CONSENT_VERSION
    assert member.face_consent_at and member.face_consent_recorded_by_id == member.id
    assert db_session.query(SecurityAlert).count() == 0


def test_enrollment_and_replacement_cannot_change_owner_or_librarian_id(client, db_session, monkeypatch):
    member = account(db_session)
    other = account(db_session, suffix='other')
    setup_verified(db_session, member)
    member.face_encoding = json.dumps([.1] * 128)
    member.face_id_verified_at = now_ph()
    member.face_consent_method = 'self_id_checked'
    other.face_encoding = json.dumps([.7] * 128)
    old = FaceEmbedding(user_id=member.id, engine='insightface', dimension=512,
        embedding=json.dumps([.1] * 512), source='enrollment', is_active=True)
    db_session.add(old); db_session.commit()
    original_identity = (member.name, member.id_image_url, member.id_document_digest,
        member.id_document_type, member.id_verified_at, member.id_verified_by_id)
    sign_in(client, member); mock_live(monkeypatch, live=face(.2))
    result = client.post('/api/auth/enroll-face', json=payload(user_id=other.id,
        name='Ignored name', id_image='not-an-ID', identity_verified=True))
    assert result.status_code == 200 and result.json()['operation'] == 'enrolled'
    db_session.refresh(member); db_session.refresh(other)
    assert json.loads(member.face_encoding) == [.2] * 128
    assert json.loads(other.face_encoding) == [.7] * 128
    assert original_identity == (member.name, member.id_image_url, member.id_document_digest,
        member.id_document_type, member.id_verified_at, member.id_verified_by_id)
    assert member.face_id_verified_at is None and member.face_consent_method == 'self'
    assert db_session.query(FaceEmbedding).filter_by(user_id=member.id).count() == 0


@pytest.mark.parametrize('consent', [{}, {'accept_face_recognition': False},
    {'accept_face_recognition': 'true'}, {'accept_face_recognition': True},
    {'accept_face_recognition': True, 'face_consent_version': '2026-11-25'}])
def test_previous_agreement_does_not_replace_fresh_current_consent(client, db_session, monkeypatch, consent):
    member = account(db_session)
    member.face_consent_at = now_ph(); member.face_consent_version = FACE_CONSENT_VERSION
    db_session.commit(); sign_in(client, member)
    def forbidden(*args, **kwargs): pytest.fail('No image processing before current consent')
    monkeypatch.setattr(engine, 'detect_faces', forbidden)
    assert client.post('/api/auth/enroll-face', json={'image': 'synthetic', **consent}).status_code == 422
    db_session.refresh(member); assert member.face_encoding is None


@pytest.mark.parametrize('state', ['anonymous', 'suspended', 'deleted', 'blacklisted', 'forced_password', 'privacy_setup'])
def test_account_gates_still_apply_before_face_processing(client, db_session, monkeypatch, state):
    member = account(db_session)
    if state != 'anonymous': sign_in(client, member)
    if state == 'suspended': member.status = 'suspended'
    if state == 'deleted': member.deleted_at = now_ph()
    if state == 'blacklisted': member.is_blacklisted = True
    if state == 'forced_password': member.must_change_password = True
    if state == 'privacy_setup': member.privacy_consent_pending = True
    db_session.commit()
    def forbidden(*args, **kwargs): pytest.fail('Restricted accounts cannot process enrollment')
    monkeypatch.setattr(engine, 'detect_faces', forbidden)
    assert client.post('/api/auth/enroll-face', json=payload()).status_code in (401,403)


@pytest.mark.parametrize('hint,code', [('spoof',422),('uncertain',422),('retry',422),
    ('too_dark',422),('too_far',422),('unavailable',503)])
def test_failed_pad_never_replaces_existing_face_or_consent(client, db_session, monkeypatch, hint, code):
    member = account(db_session)
    member.face_encoding = json.dumps([.1] * 128)
    member.face_consent_version = 'earlier'; member.face_consent_method = 'librarian_assisted'
    db_session.commit(); sign_in(client, member); mock_live(monkeypatch, hint)
    result = client.post('/api/auth/enroll-face', json=payload())
    assert result.status_code == code
    db_session.refresh(member)
    assert json.loads(member.face_encoding) == [.1] * 128
    assert member.face_consent_version == 'earlier' and member.face_consent_method == 'librarian_assisted'
    assert db_session.query(SecurityAlert).count() == 0


@pytest.mark.parametrize('case,code', [('no_face',422),('multiple',422),('unavailable',503),('duplicate',409)])
def test_face_and_duplicate_checks_cannot_be_skipped(client, db_session, monkeypatch, case, code):
    member = account(db_session); sign_in(client, member); mock_live(monkeypatch)
    if case in ('no_face','multiple'):
        monkeypatch.setattr(engine,'detect_faces',lambda *a,**kw: [] if case=='no_face' else [face(),face()])
    if case == 'unavailable':
        def unavailable(*args, **kwargs): raise RuntimeError('private engine details')
        monkeypatch.setattr(engine,'detect_faces',unavailable)
    if case == 'duplicate': monkeypatch.setattr(engine,'find_duplicate_for_enrollment',lambda *a,**kw: object())
    result = client.post('/api/auth/enroll-face', json=payload())
    assert result.status_code == code and 'private engine details' not in result.text
    db_session.refresh(member); assert member.face_encoding is None and member.face_consent_at is None


def test_online_insightface_template_retains_legacy_compatibility_and_source(client, db_session, monkeypatch):
    member = account(db_session); sign_in(client, member); mock_live(monkeypatch)
    live = {'engine':'insightface','encoding':[.2]*512,'dlib_encoding':[.3]*128,
        'dimension':512,'quality':{'score':.9},'face_box':face()['face_box']}
    monkeypatch.setattr(engine,'detect_faces',lambda *a,**kw:[live])
    assert client.post('/api/auth/enroll-face',json=payload()).status_code == 200
    db_session.refresh(member)
    assert json.loads(member.face_encoding) == [.3]*128
    saved = db_session.query(FaceEmbedding).filter_by(user_id=member.id).one()
    assert saved.source == 'remote_self' and saved.dimension == 512
    assert json.loads(saved.embedding) == [.2]*512
