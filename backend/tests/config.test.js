const request = require('supertest');

// Mockear statsRepository completo para evitar el caché de módulo entre tests
jest.mock('../repositories/statsRepository', () => ({
    obtenerEspecialesCacheado: jest.fn(),
    getSummary: jest.fn(),
    getDaily: jest.fn(),
    getHistory: jest.fn(),
    getExport: jest.fn(),
}));

jest.mock('../db', () => ({
    pool: { promise: () => ({ query: jest.fn() }) },
    query: jest.fn(),
}));

const statsRepo = require('../repositories/statsRepository');
const db = require('../db');
const { app } = require('../server');

beforeEach(() => jest.resetAllMocks());

describe('Configuración — GET /api/config/especiales', () => {
    it('devuelve arrays vips y gerencia correctamente', async () => {
        statsRepo.obtenerEspecialesCacheado.mockResolvedValueOnce({
            vips: ['14', '27'],
            gerencia: ['16', '119', '120'],
        });

        const res = await request(app).get('/api/config/especiales');

        expect(res.status).toBe(200);
        expect(res.body.vips).toEqual(expect.arrayContaining(['14', '27']));
        expect(res.body.gerencia).toEqual(expect.arrayContaining(['16', '119', '120']));
    });

    it('usuario marcado VIP aparece solo en vips, no en gerencia', async () => {
        statsRepo.obtenerEspecialesCacheado.mockResolvedValueOnce({
            vips: ['14'],
            gerencia: [],
        });

        const res = await request(app).get('/api/config/especiales');

        expect(res.status).toBe(200);
        expect(res.body.vips).toContain('14');
        expect(res.body.gerencia).not.toContain('14');
    });

    it('sin usuarios especiales devuelve arrays vacíos', async () => {
        statsRepo.obtenerEspecialesCacheado.mockResolvedValueOnce({
            vips: [],
            gerencia: [],
        });

        const res = await request(app).get('/api/config/especiales');

        expect(res.status).toBe(200);
        expect(res.body.vips).toHaveLength(0);
        expect(res.body.gerencia).toHaveLength(0);
    });
});

describe('Configuración — GET /api/config', () => {
    it('devuelve configuración como objeto clave-valor', async () => {
        db.query.mockResolvedValueOnce([
            { clave: 'horario_activo', valor: 'true' },
            { clave: 'horario_inicio', valor: '11:00' },
            { clave: 'horario_fin', valor: '13:30' },
        ]);

        const res = await request(app).get('/api/config');

        expect(res.status).toBe(200);
        expect(res.body.horario_activo).toBe('true');
        expect(res.body.horario_inicio).toBe('11:00');
    });
});
