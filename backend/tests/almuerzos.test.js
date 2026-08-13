/**
 * Pruebas del contrato HTTP de /api/almuerzos.
 * El repositorio va mockeado (su SQL se prueba en almuerzoRepository.integration.test.js);
 * aquí se valida autenticación, serialización y validación de entrada.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../repositories/almuerzoRepository', () => ({
    listar: jest.fn(),
    listarRango: jest.fn(),
    resumen: jest.fn(),
    cerrarManual: jest.fn(),
    invalidarConfig: jest.fn(),
    obtenerConfig: jest.fn(),
    normalizarRango: jest.fn(),
    ESTADOS_VALIDOS: [],
}));

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

const almuerzoRepo = require('../repositories/almuerzoRepository');
const { app } = require('../server');

const SECRET = process.env.ADMIN_JWT_SECRET;
const tokenAdmin = jwt.sign({ id: 1, nombre: 'Admin Prueba', rol: 'admin', permisos: ['admin'] }, SECRET);
const tokenSuper = jwt.sign({ id: 2, nombre: 'John', rol: 'superadmin', permisos: ['superadmin', 'admin'] }, SECRET);

const auth = t => ({ Authorization: `Bearer ${t}` });

// Fila cruda tal como la devuelve MySQL
const FILA = {
    id: 7,
    user_id: '101',
    nombre: 'ORELLANA ROGER',
    fecha: new Date(2026, 7, 12), // 2026-08-12 en hora local
    hora_salida: '12:11:31',
    hora_retorno: '12:48:56',
    segundos: 2245,
    estado_efectivo: 'EXCEDIDO',
    tipo_ticket: 'TICKET ALMUERZO',
    numero_ticket: 5,
    cierre_manual: 0,
    observacion: null,
    origen: 'BIOMETRICO',
};

beforeEach(() => jest.resetAllMocks());

describe('Almuerzos — autenticación', () => {
    const rutas = [
        ['get', '/api/almuerzos'],
        ['get', '/api/almuerzos/resumen'],
        ['get', '/api/almuerzos/excel'],
        ['post', '/api/almuerzos/1/cerrar-manual'],
    ];

    it.each(rutas)('%s %s rechaza peticiones sin token', async (metodo, ruta) => {
        const res = await request(app)[metodo](ruta);
        expect(res.status).toBe(403);
    });

    it.each(rutas)('%s %s rechaza un token inválido', async (metodo, ruta) => {
        const res = await request(app)[metodo](ruta).set(auth('token-basura'));
        expect(res.status).toBe(401);
    });

    it('cerrar-manual exige superadmin, no basta admin', async () => {
        const res = await request(app)
            .post('/api/almuerzos/1/cerrar-manual')
            .set(auth(tokenAdmin))
            .send({ horaRetorno: '12:30' });
        expect(res.status).toBe(403);
        expect(almuerzoRepo.cerrarManual).not.toHaveBeenCalled();
    });
});

describe('Almuerzos — GET /api/almuerzos', () => {
    it('serializa la fila con duración y etiqueta legibles', async () => {
        almuerzoRepo.listar.mockResolvedValueOnce({ data: [FILA], total: 1, page: 1, pageSize: 50 });

        const res = await request(app).get('/api/almuerzos').set(auth(tokenAdmin));

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0]).toEqual({
            id: 7,
            userId: '101',
            nombre: 'ORELLANA ROGER',
            fecha: '2026-08-12',
            horaSalida: '12:11',
            horaRetorno: '12:48',
            segundos: 2245,
            duracion: '37:25',
            estado: 'EXCEDIDO',
            estadoLabel: 'Excedió el tiempo',
            tipoTicket: 'TICKET ALMUERZO',
            numeroTicket: 5,
            cierreManual: false,
            observacion: null,
            origen: 'BIOMETRICO',
        });
    });

    it('marca como BIOMETRICO una fila sin columna origen (compatibilidad)', async () => {
        const { origen, ...sinOrigen } = FILA;
        almuerzoRepo.listar.mockResolvedValueOnce({ data: [sinOrigen], total: 1, page: 1, pageSize: 50 });

        const res = await request(app).get('/api/almuerzos').set(auth(tokenAdmin));

        expect(res.body.data[0].origen).toBe('BIOMETRICO');
    });

    it('distingue las sesiones reconstruidas del histórico', async () => {
        almuerzoRepo.listar.mockResolvedValueOnce({
            data: [{ ...FILA, origen: 'BACKFILL' }], total: 1, page: 1, pageSize: 50,
        });

        const res = await request(app).get('/api/almuerzos').set(auth(tokenAdmin));

        expect(res.body.data[0].origen).toBe('BACKFILL');
    });

    it('una sesión sin retorno serializa null en lugar de romper', async () => {
        almuerzoRepo.listar.mockResolvedValueOnce({
            data: [{ ...FILA, hora_retorno: null, segundos: null, estado_efectivo: 'SIN_RETORNO' }],
            total: 1, page: 1, pageSize: 50,
        });

        const res = await request(app).get('/api/almuerzos').set(auth(tokenAdmin));

        expect(res.body.data[0].horaRetorno).toBe(null);
        expect(res.body.data[0].duracion).toBe(null);
        expect(res.body.data[0].estadoLabel).toBe('No marcó retorno');
    });

    it('pasa los filtros al repositorio', async () => {
        almuerzoRepo.listar.mockResolvedValueOnce({ data: [], total: 0, page: 2, pageSize: 20 });

        await request(app)
            .get('/api/almuerzos?desde=2026-08-01&hasta=2026-08-12&estado=EXCEDIDO&q=roger&page=2&pageSize=20')
            .set(auth(tokenAdmin));

        expect(almuerzoRepo.listar).toHaveBeenCalledWith(expect.objectContaining({
            desde: '2026-08-01', hasta: '2026-08-12', estado: 'EXCEDIDO', q: 'roger',
            page: '2', pageSize: '20',
        }));
    });

    it('no filtra detalles del error al cliente si el repositorio falla', async () => {
        almuerzoRepo.listar.mockRejectedValueOnce(new Error('ER_NO_SUCH_TABLE: almuerzo_sesiones'));

        const res = await request(app).get('/api/almuerzos').set(auth(tokenAdmin));

        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/ER_NO_SUCH_TABLE/);
    });
});

describe('Almuerzos — GET /api/almuerzos/resumen', () => {
    it('agrega las duraciones formateadas al resumen', async () => {
        almuerzoRepo.resumen.mockResolvedValueOnce({
            desde: '2026-08-12', hasta: '2026-08-12',
            salidas: 113, retornos: 61, aTiempo: 40, excedidos: 21,
            enAlmuerzo: 0, excedidoEnCurso: 0, sinRetorno: 52, sinMarcar: 52,
            promedioSegundos: 1863, maximoSegundos: 2250,
            minutosPermitidos: 30, toleranciaMinutos: 0, controlActivo: true,
        });

        const res = await request(app).get('/api/almuerzos/resumen?fecha=2026-08-12').set(auth(tokenAdmin));

        expect(res.status).toBe(200);
        expect(res.body.promedioDuracion).toBe('31:03');
        expect(res.body.maximoDuracion).toBe('37:30');
        expect(res.body.sinMarcar).toBe(52);
    });

    it('tolera un resumen sin retornos (promedio null)', async () => {
        almuerzoRepo.resumen.mockResolvedValueOnce({
            desde: '2026-08-13', hasta: '2026-08-13',
            salidas: 0, retornos: 0, aTiempo: 0, excedidos: 0,
            enAlmuerzo: 0, excedidoEnCurso: 0, sinRetorno: 0, sinMarcar: 0,
            promedioSegundos: null, maximoSegundos: null,
            minutosPermitidos: 30, toleranciaMinutos: 0, controlActivo: true,
        });

        const res = await request(app).get('/api/almuerzos/resumen').set(auth(tokenAdmin));

        expect(res.status).toBe(200);
        expect(res.body.promedioDuracion).toBe(null);
    });
});

describe('Almuerzos — GET /api/almuerzos/excel', () => {
    it('devuelve un xlsx con nombre de archivo por rango', async () => {
        almuerzoRepo.listarRango.mockResolvedValueOnce([FILA]);
        almuerzoRepo.resumen.mockResolvedValueOnce({
            desde: '2026-08-01', hasta: '2026-08-12',
            salidas: 1, retornos: 1, aTiempo: 0, excedidos: 1,
            enAlmuerzo: 0, excedidoEnCurso: 0, sinRetorno: 0, sinMarcar: 0,
            promedioSegundos: 2245, maximoSegundos: 2245,
            minutosPermitidos: 30, toleranciaMinutos: 0, controlActivo: true,
        });

        const res = await request(app).get('/api/almuerzos/excel?desde=2026-08-01&hasta=2026-08-12')
            .set(auth(tokenAdmin))
            .responseType('blob'); // sin esto supertest no entrega el binario como Buffer

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/spreadsheetml/);
        expect(res.headers['content-disposition'])
            .toBe('attachment; filename="control_almuerzo_2026-08-01_a_2026-08-12.xlsx"');
        // Un .xlsx es un ZIP: debe empezar con la firma PK
        expect(res.body.subarray(0, 2).toString()).toBe('PK');
    });
});

describe('Almuerzos — POST /:id/cerrar-manual', () => {
    it('cierra la sesión y devuelve la duración', async () => {
        almuerzoRepo.cerrarManual.mockResolvedValueOnce({ ok: true, estado: 'A_TIEMPO', segundos: 1312 });

        const res = await request(app)
            .post('/api/almuerzos/7/cerrar-manual')
            .set(auth(tokenSuper))
            .send({ horaRetorno: '12:00', observacion: 'Olvidó marcar' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, estado: 'A_TIEMPO', duracion: '21:52' });
        expect(almuerzoRepo.cerrarManual).toHaveBeenCalledWith('7', {
            horaRetorno: '12:00',
            observacion: 'Olvidó marcar',
            adminNombre: 'John',
        });
    });

    it('devuelve 400 con el motivo cuando el repositorio rechaza', async () => {
        almuerzoRepo.cerrarManual.mockResolvedValueOnce({ ok: false, motivo: 'La sesión ya tiene retorno registrado' });

        const res = await request(app)
            .post('/api/almuerzos/7/cerrar-manual')
            .set(auth(tokenSuper))
            .send({ horaRetorno: '12:00' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/ya tiene retorno/);
    });

    it('recorta observaciones excesivamente largas', async () => {
        almuerzoRepo.cerrarManual.mockResolvedValueOnce({ ok: true, estado: 'A_TIEMPO', segundos: 60 });

        await request(app)
            .post('/api/almuerzos/7/cerrar-manual')
            .set(auth(tokenSuper))
            .send({ horaRetorno: '12:00', observacion: 'x'.repeat(500) });

        expect(almuerzoRepo.cerrarManual.mock.calls[0][1].observacion).toHaveLength(200);
    });

    it('no falla si el cuerpo viene vacío', async () => {
        almuerzoRepo.cerrarManual.mockResolvedValueOnce({ ok: false, motivo: 'Hora de retorno inválida (formato HH:MM)' });

        const res = await request(app)
            .post('/api/almuerzos/7/cerrar-manual')
            .set(auth(tokenSuper));

        expect(res.status).toBe(400);
    });
});
