const request = require('supertest');

// El pool devuelve usuario no encontrado en todos los intentos
const mockPoolQuery = jest.fn().mockResolvedValue([[]]); // siempre array vacío
jest.mock('../db', () => ({
    pool: { promise: () => ({ query: mockPoolQuery }) },
    query: jest.fn(),
}));

// Aislamos módulos para que este test tenga su propio rate limiter (contador en 0)
let app;
beforeAll(() => {
    jest.resetModules();
    // Resetear mock tras resetModules
    jest.mock('../db', () => ({
        pool: { promise: () => ({ query: jest.fn().mockResolvedValue([[]])}) },
        query: jest.fn(),
    }));
    ({ app } = require('../server'));
});

describe('Rate limiting — POST /api/admin/login', () => {
    // El limitador se lleva por (IP + username), así que todos los intentos
    // de este bloque usan el MISMO usuario para caer en la misma clave.
    it('15 intentos fallidos devuelven 401', async () => {
        for (let i = 0; i < 15; i++) {
            const res = await request(app)
                .post('/api/admin/login')
                .send({ username: 'usuario_prueba', password: 'cualquiera' });
            expect(res.status).toBe(401);
        }
    });

    it('el intento número 16 devuelve 429 (Too Many Requests)', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'usuario_prueba', password: 'cualquiera' });

        expect(res.status).toBe(429);
        expect(res.body.error).toMatch(/Demasiados intentos/i);
    });

    it('otro usuario desde la misma IP NO queda bloqueado', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'otro_usuario', password: 'cualquiera' });

        expect(res.status).toBe(401);
    });
});
