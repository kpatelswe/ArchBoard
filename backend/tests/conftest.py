import os

os.environ.setdefault('DATABASE_URL', 'postgresql+asyncpg://test:test@localhost/test')
os.environ.setdefault('CLERK_SECRET_KEY', 'sk_test_placeholder')
