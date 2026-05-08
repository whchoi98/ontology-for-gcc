import os
os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def test_healthz_returns_200_ok():
    response = client.get('/healthz')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}
