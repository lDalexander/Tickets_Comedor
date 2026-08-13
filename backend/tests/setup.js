// Variables de entorno para tests — se cargan ANTES de cualquier módulo
process.env.ADMIN_JWT_SECRET = 'test-jwt-secret-for-jest-do-not-use-in-production';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'control_comedor_test';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
