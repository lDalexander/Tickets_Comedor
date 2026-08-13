const request = require('supertest');
const bcrypt = require('bcrypt');

// Mock del pool de DB que usa adminRoutes (pool.promise().query)
const mockPoolQuery = jest.fn();
jest.mock('../db', () => ({
    pool: {
        promise: () => ({ query: mockPoolQuery }),
    },
    query: jest.fn(),
}));

const { app } = require('../server');

const VALID_TOKEN_HEADERS = () => ({
    Authorization: `Bearer ${require('jsonwebtoken').sign(
        { id: 1, nombre: 'Admin Test', rol: 'admin' },
        process.env.ADMIN_JWT_SECRET,
        { expiresIn: '1h' }
    )}`
});

describe('Autenticación — POST /api/admin/login', () => {
    afterEach(() => jest.clearAllMocks());

    it('login correcto devuelve JWT y datos del usuario', async () => {
        const hash = await bcrypt.hash('password123', 10);
        mockPoolQuery.mockResolvedValueOnce([[
            { id: 1, username: 'admin', nombre_real: 'Admin Test', rol: 'admin', password_hash: hash }
        ]]);

        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'admin', password: 'password123' });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.rol).toBe('admin');
    });

    it('contraseña incorrecta devuelve 401', async () => {
        const hash = await bcrypt.hash('correcta', 10);
        mockPoolQuery.mockResolvedValueOnce([[
            { id: 1, username: 'admin', nombre_real: 'Admin Test', rol: 'admin', password_hash: hash }
        ]]);

        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'admin', password: 'incorrecta' });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/contraseña/i);
    });

    it('usuario no encontrado devuelve 401', async () => {
        mockPoolQuery.mockResolvedValueOnce([[]]); // Sin resultados

        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'noexiste', password: 'cualquiera' });

        expect(res.status).toBe(401);
    });

    it('body vacío devuelve 400', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({});

        expect(res.status).toBe(400);
    });
});

describe('Autenticación — rutas protegidas', () => {
    afterEach(() => jest.clearAllMocks());

    it('GET /api/admin/tables sin token devuelve 403', async () => {
        const res = await request(app).get('/api/admin/tables');
        expect(res.status).toBe(403);
    });

    it('GET /api/admin/tables con token expirado devuelve 401', async () => {
        const expiredToken = require('jsonwebtoken').sign(
            { id: 1, rol: 'admin' },
            process.env.ADMIN_JWT_SECRET,
            { expiresIn: '-1s' }
        );

        const res = await request(app)
            .get('/api/admin/tables')
            .set('Authorization', `Bearer ${expiredToken}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/expirado/i);
    });

    it('GET /api/admin/tables con token válido llega al handler', async () => {
        mockPoolQuery.mockResolvedValueOnce([[{ 'Tables_in_control_comedor_test': 'usuarios' }]]);

        const res = await request(app)
            .get('/api/admin/tables')
            .set(VALID_TOKEN_HEADERS());

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
