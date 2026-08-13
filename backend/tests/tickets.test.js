const request = require('supertest');

// Mock de db.query (manualTicketRoutes usa db.query, no pool.promise)
const mockDbQuery = jest.fn();
jest.mock('../db', () => ({
    pool: { promise: () => ({ query: jest.fn() }) },
    query: mockDbQuery,
}));

// Mock de child_process.exec para no invocar el script Python
jest.mock('child_process', () => ({
    exec: jest.fn((cmd, cb) => cb(null, '', '')),
}));

const { app } = require('../server');

describe('Tickets manuales — POST /api/manual-tickets/login', () => {
    afterEach(() => jest.clearAllMocks());

    it('login con credenciales correctas devuelve datos del usuario', async () => {
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash('pass123', 10);

        mockDbQuery.mockResolvedValueOnce([
            { id: 5, username: 'operador1', nombre_real: 'Juan Pérez', password_hash: hash }
        ]);

        const res = await request(app)
            .post('/api/manual-tickets/login')
            .send({ username: 'operador1', password: 'pass123' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user.username).toBe('operador1');
    });

    it('usuario inactivo devuelve 401', async () => {
        mockDbQuery.mockResolvedValueOnce([]); // activo=0 → sin resultado

        const res = await request(app)
            .post('/api/manual-tickets/login')
            .send({ username: 'inactivo', password: 'cualquiera' });

        expect(res.status).toBe(401);
    });
});

describe('Tickets manuales — POST /api/manual-tickets/print (TICKET VISITA)', () => {
    afterEach(() => jest.clearAllMocks());

    it('ticket de visita se registra y devuelve número de ticket', async () => {
        // 1. Verificar operador autorizado
        mockDbQuery.mockResolvedValueOnce([{ nombre_real: 'Juan Pérez' }]);
        // 2. Leer configuración de horario (horario_activo=false → sin restricción)
        mockDbQuery.mockResolvedValueOnce([
            { clave: 'horario_activo', valor: 'false' }
        ]);
        // 3. Tickets usados hoy → ninguno
        mockDbQuery.mockResolvedValueOnce([]);
        // 4. INSERT log_tickets_manuales
        mockDbQuery.mockResolvedValueOnce({ insertId: 1 });
        // 5. INSERT registros
        mockDbQuery.mockResolvedValueOnce({ insertId: 100 });

        const res = await request(app)
            .post('/api/manual-tickets/print')
            .send({ visitorName: 'Carlos López', printedByUserId: 5 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toMatch(/Ticket #1/);
    });

    it('operador no autorizado devuelve 403', async () => {
        mockDbQuery.mockResolvedValueOnce([]); // sin operador

        const res = await request(app)
            .post('/api/manual-tickets/print')
            .send({ visitorName: 'Ana Torres', printedByUserId: 999 });

        expect(res.status).toBe(403);
    });

    it('body sin datos requeridos devuelve 400', async () => {
        const res = await request(app)
            .post('/api/manual-tickets/print')
            .send({});

        expect(res.status).toBe(400);
    });
});

describe('Tickets manuales — anti-duplicado (POST /api/manual-tickets/print-tercero)', () => {
    afterEach(() => jest.clearAllMocks());

    it('empleado que ya comió hoy devuelve 409', async () => {
        // 1. Operador existe
        mockDbQuery.mockResolvedValueOnce([{ nombre_real: 'Juan Pérez' }]);
        // 2. Empleado existe
        mockDbQuery.mockResolvedValueOnce([{ zk_id: '42', nombre_completo: 'María García', tipo_menu_predeterminado: 'Normal' }]);
        // 3. Verificar horario
        mockDbQuery.mockResolvedValueOnce([{ clave: 'horario_activo', valor: 'false' }]);
        // 4. Anti-duplicado → ya tiene ticket hoy
        mockDbQuery.mockResolvedValueOnce([{ conteo: 1 }]);

        const res = await request(app)
            .post('/api/manual-tickets/print-tercero')
            .send({ employeeId: '42', printedByUserId: 5 });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/ya tiene ticket/i);
    });

    it('empleado sin ticket hoy registra TICKET TERCERO', async () => {
        // 1. Operador
        mockDbQuery.mockResolvedValueOnce([{ nombre_real: 'Juan Pérez' }]);
        // 2. Empleado
        mockDbQuery.mockResolvedValueOnce([{ zk_id: '55', nombre_completo: 'Pedro Ruiz', tipo_menu_predeterminado: 'Normal' }]);
        // 3. Horario
        mockDbQuery.mockResolvedValueOnce([{ clave: 'horario_activo', valor: 'false' }]);
        // 4. Anti-duplicado → no ha comido
        mockDbQuery.mockResolvedValueOnce([{ conteo: 0 }]);
        // 5. Menú del día → normal
        mockDbQuery.mockResolvedValueOnce([]);
        // 6. Tickets usados hoy → ninguno
        mockDbQuery.mockResolvedValueOnce([]);
        // 7. INSERT registros
        mockDbQuery.mockResolvedValueOnce({ insertId: 200 });
        // 8. INSERT log auditoría
        mockDbQuery.mockResolvedValueOnce({ insertId: 50 });

        const res = await request(app)
            .post('/api/manual-tickets/print-tercero')
            .send({ employeeId: '55', printedByUserId: 5 });

        expect(res.status).toBe(200);
        expect(res.body.tipoTicket).toBe('TICKET ALMUERZO');
        expect(res.body.ticketNumber).toBe(1);
    });
});
