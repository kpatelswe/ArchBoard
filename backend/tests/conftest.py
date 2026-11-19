import os

os.environ.setdefault('DATABASE_URL', 'postgresql+asyncpg://test:test@localhost/test')
os.environ.setdefault('CLERK_SECRET_KEY', 'sk_test_placeholder')


import fnmatch

import pytest


class FakeRedis:
    def __init__(self):
        self.data = {}

    async def set(self, key, value, ex=None):
        self.data[key] = value

    async def mget(self, keys):
        return [self.data.get(key) for key in keys]

    async def delete(self, *keys):
        for key in keys:
            self.data.pop(key, None)

    async def scan_iter(self, match='*', count=None):
        for key in list(self.data):
            if fnmatch.fnmatchcase(key, match):
                yield key


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr('app.realtime.unsaved._client', lambda: redis)
    return redis
