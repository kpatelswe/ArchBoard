from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def test_me_rejects_anonymous_request():
    response = client.get("/api/me")

    assert response.status_code == 401


def test_me_rejects_forged_token():
    response = client.get("/api/me", headers={"Authorization": "Bearer not.a.token"})

    assert response.status_code == 401
