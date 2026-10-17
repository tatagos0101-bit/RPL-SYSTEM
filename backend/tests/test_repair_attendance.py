from types import SimpleNamespace
from models.user import User
from models.entry_log import EntryLog


def test_website_face_login_never_records_attendance(client, db_session, monkeypatch):
    from services import face_engine_service, liveness_service
    user = User(name='Synthetic member', role='member', password_hash='unused')
    db_session.add(user); db_session.commit()
    monkeypatch.setattr(liveness_service, 'check_liveness', lambda _: ('ok', 1))
    monkeypatch.setattr(face_engine_service, 'detect_faces', lambda *args, **kwargs: [{'engine': 'test'}])
    monkeypatch.setattr(face_engine_service, 'find_match_for_face', lambda *args, **kwargs: SimpleNamespace(user=user, engine='test', score=1))
    response = client.post('/api/auth/face', json={'image': 'synthetic'})
    assert response.status_code == 200, response.text
    assert response.json()['matched']
    assert response.json()['token']
    assert db_session.query(EntryLog).count() == 0
    monkeypatch.setattr(face_engine_service, 'find_match_for_face', lambda *args, **kwargs: None)
    assert client.post('/api/auth/face', json={'image': 'synthetic'}).status_code == 200
    assert db_session.query(EntryLog).count() == 0
