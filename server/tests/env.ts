// Applied before any app module loads in each test file.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_SCHEMA_URL!;
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-0123";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_DIR = "./.test-storage";
process.env.MAIL_DRIVER = "log";
process.env.APP_URL = "http://app.test";
process.env.API_PUBLIC_URL = "http://api.test";
delete process.env.REDIS_URL;
process.env.CORS_ORIGINS = "http://app.test";
