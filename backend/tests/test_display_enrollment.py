import json

from models.user import User
from models.face_embedding import FaceEmbedding
from routers.auth import _hash
from services import face_engine_service


def test_display_marker_does_not_create_real_biometrics_or_enrollment(client, db_session):
    staff = User(
        name='Synthetic staff', email='staff@example.com', role='librarian',
        password_hash=_hash('Password1'),
    )
    member = User(
        name='Synthetic presentation', email='member@example.com', role='member',
        password_hash=_hash('Password1'), face_enrollment_display_only=True,
    )
    db_session.add_all([staff, member])
    db_session.commit()
    response = client.post('/api/auth/login', json={
        'email': staff.email, 'password': 'Password1',
    })
    assert response.status_code == 200
    row = client.get('/api/librarian/users').json()[0]
    assert row['face_enrollment_display_only'] is True
    assert row['face_enrolled'] is False
    assert client.get('/api/librarian/users/stats').json()['enrolled'] == 0
    assert member.face_encoding is None
    assert db_session.query(FaceEmbedding).count() == 0
    assert face_engine_service.find_match_for_face(
        db_session, {'engine': 'dlib', 'encoding': [.1] * 128}, purpose='gate',
    ) is None
    client.post('/api/auth/logout')
    client.post('/api/auth/login', json={
        'email': member.email, 'password': 'Password1',
    })
    assert client.get('/api/user/biometric-status').json()['enrolled'] is False


def test_genuine_enrollment_replaces_the_display_marker(db_session):
    member = User(
        name='Synthetic replacement', role='member', password_hash='unused',
        face_enrollment_display_only=True,
    )
    db_session.add(member)
    db_session.commit()
    face_engine_service.store_enrollment_face(
        db_session, member, {'engine': 'dlib', 'encoding': [.1] * 128},
    )
    db_session.commit()
    assert member.face_enrollment_display_only is False
    assert json.loads(member.face_encoding) == [.1] * 128
