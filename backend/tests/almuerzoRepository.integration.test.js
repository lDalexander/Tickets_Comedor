/**
 * Pruebas del repositorio de control de almuerzo.
 *
 * Crea una BD desechable (comedor_test_almuerzo_api), le aplica el CREATE TABLE
 * real de sql/migrations/004_control_almuerzo.sql, inserta sesiones en todos los
 * estados posibles y valida el SQL de verdad. No toca la base de producción.
 *
 * Es un test de INTEGRACIÓN: necesita un MySQL accesible con las credenciales de
 * backend/.env y permiso CREATE DATABASE. Queda fuera de `npm test`.
 *
 *   cd backend && npm run test:integration
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_PRUEBA = 'comedor_test_almuerzo_api';
const MIGRACION = path.resolve(__dirname, '../../sql/migrations/004_control_almuerzo.sql');

// `override: true` es necesario: tests/setup.js ya dejó credenciales ficticias
// en el entorno y este test requiere las reales para hablar con MySQL.
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const CONEXION = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 3306),
    multipleStatements: true,
};

// Fecha fija para los casos históricos (independiente del día en que se corra)
const AYER = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const HOY = new Date().toISOString().slice(0, 10);

/** 'HH:MM:SS' desde N minutos antes de ahora — para simular sesiones en curso. */
function haceMinutos(minutos) {
    const d = new Date(Date.now() - minutos * 60000);
    return d.toTimeString().slice(0, 8);
}

let repo;
let admin;

beforeAll(async () => {
    admin = await mysql.createConnection(CONEXION);
    await admin.query(`DROP DATABASE IF EXISTS ${DB_PRUEBA}`);
    await admin.query(`CREATE DATABASE ${DB_PRUEBA}`);
    await admin.changeUser({ database: DB_PRUEBA });

    // Tabla `configuracion` mínima con los parámetros del módulo
    await admin.query(`
        CREATE TABLE configuracion (
            clave VARCHAR(50) NOT NULL PRIMARY KEY,
            valor TEXT
        ) ENGINE=InnoDB`);
    await admin.query(`
        INSERT INTO configuracion (clave, valor) VALUES
            ('almuerzo_control_activo', 'true'),
            ('almuerzo_minutos_permitidos', '30'),
            ('almuerzo_tolerancia_minutos', '0'),
            ('almuerzo_zonas_disponibles', 'BODEGA,LOGISTICA,SOLIDO,LIQUIDO,SOPLADO,MANTENIMIENTO,ADMINISTRATIVOS'),
            ('almuerzo_zonas_controladas', 'SOLIDO,LIQUIDO,SOPLADO,MANTENIMIENTO'),
            ('almuerzo_controlar_sin_zona', 'true')`);

    // `usuarios` con zona: el repositorio hace LEFT JOIN contra ella.
    // La colación debe coincidir con almuerzo_sesiones o el JOIN aborta.
    await admin.query(`
        CREATE TABLE usuarios (
            zk_id VARCHAR(50) NOT NULL PRIMARY KEY,
            nombre_completo VARCHAR(150) NOT NULL,
            role VARCHAR(50) DEFAULT 'Operativo',
            zona VARCHAR(20) DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
    await admin.query(`
        INSERT INTO usuarios (zk_id, nombre_completo, role, zona) VALUES
            ('101', 'ORELLANA ROGER',       'Operativo',      'SOLIDO'),
            ('102', 'COELLO ADRIAN',        'Operativo',      'SOLIDO'),
            ('103', 'ARAGON ERWIN',         'Operativo',      'LIQUIDO'),
            ('104', 'MORA JOSE LUIS',       'Operativo',      NULL),
            ('105', 'PENDIENTE DE CERRAR',  'Operativo',      'BODEGA'),
            ('201', 'EN SU TIEMPO',         'Operativo',      'SOPLADO'),
            ('202', 'YA SE PASO',           'Administrativo', 'ADMINISTRATIVOS')`);

    // El DDL sale del archivo de migración: si cambia, la prueba lo refleja
    const sqlMigracion = fs.readFileSync(MIGRACION, 'utf8');
    const inicio = sqlMigracion.indexOf('CREATE TABLE IF NOT EXISTS `almuerzo_sesiones`');
    const fin = sqlMigracion.indexOf(';', sqlMigracion.indexOf('ENGINE=InnoDB', inicio));
    await admin.query(sqlMigracion.slice(inicio, fin));

    // ── Datos: una sesión por cada estado posible ──
    await admin.query(
        `INSERT INTO almuerzo_sesiones
            (user_id, nombre, fecha, hora_salida, hora_retorno, segundos_usados, estado, tipo_ticket, numero_ticket)
         VALUES
            ('101','ORELLANA ROGER',       ?, '12:11:31', '12:36:31', 1500, 'A_TIEMPO', 'TICKET ALMUERZO', 5),
            ('102','COELLO ADRIAN',        ?, '12:11:26', '12:48:56', 2250, 'EXCEDIDO', 'TICKET ALMUERZO', 6),
            ('103','ARAGON ERWIN',         ?, '11:55:54', '12:26:34', 1840, 'EXCEDIDO', 'TICKET DIETA',    7),
            ('104','MORA JOSE LUIS',       ?, '11:38:08', NULL,       NULL, 'SIN_RETORNO','TICKET ALMUERZO',8),
            ('105','PENDIENTE DE CERRAR',  ?, '11:39:00', NULL,       NULL, 'EN_ALMUERZO','TICKET ALMUERZO',9)`,
        [AYER, AYER, AYER, AYER, AYER]
    );
    // Sesiones de hoy en curso: una dentro de su tiempo, otra ya vencida
    await admin.query(
        `INSERT INTO almuerzo_sesiones
            (user_id, nombre, fecha, hora_salida, estado, tipo_ticket, numero_ticket)
         VALUES
            ('201','EN SU TIEMPO', ?, ?, 'EN_ALMUERZO', 'TICKET ALMUERZO', 1),
            ('202','YA SE PASO',   ?, ?, 'EN_ALMUERZO', 'TICKET ALMUERZO', 2)`,
        [HOY, haceMinutos(10), HOY, haceMinutos(50)]
    );

    // El repositorio lee DB_NAME al importarse: apuntarlo antes del require
    process.env.DB_NAME = DB_PRUEBA;
    repo = require('../repositories/almuerzoRepository');
});

afterAll(async () => {
    if (admin) {
        await admin.query(`DROP DATABASE IF EXISTS ${DB_PRUEBA}`);
        await admin.end();
    }
    // Cerrar el pool del módulo db para que Jest no quede colgado
    require('../db').pool.end();
});

const porNombre = (filas, nombre) => filas.find(f => f.nombre === nombre);

describe('estado efectivo', () => {
    test('deriva los cinco estados correctamente', async () => {
        const filas = await repo.listarRango({ desde: AYER, hasta: HOY });
        expect(porNombre(filas, 'ORELLANA ROGER').estado_efectivo).toBe('A_TIEMPO');
        expect(porNombre(filas, 'COELLO ADRIAN').estado_efectivo).toBe('EXCEDIDO');
        expect(porNombre(filas, 'MORA JOSE LUIS').estado_efectivo).toBe('SIN_RETORNO');
        // Quedó EN_ALMUERZO de ayer: la vista no espera al mantenimiento de las 05:00
        expect(porNombre(filas, 'PENDIENTE DE CERRAR').estado_efectivo).toBe('SIN_RETORNO');
        // Hoy, dentro de su tiempo
        expect(porNombre(filas, 'EN SU TIEMPO').estado_efectivo).toBe('EN_ALMUERZO');
        // Hoy, ya pasó los 30 min sin marcar
        expect(porNombre(filas, 'YA SE PASO').estado_efectivo).toBe('EXCEDIDO_EN_CURSO');
    });

    test('30:40 cuenta como excedido (el límite se mide en segundos)', async () => {
        const filas = await repo.listarRango({ fecha: AYER });
        const fila = porNombre(filas, 'ARAGON ERWIN');
        expect(Number(fila.segundos)).toBe(1840);
        expect(fila.estado_efectivo).toBe('EXCEDIDO');
    });

    test('las sesiones abiertas de hoy cuentan el tiempo en vivo', async () => {
        const filas = await repo.listarRango({ fecha: HOY });
        const fila = porNombre(filas, 'EN SU TIEMPO');
        // ~10 min transcurridos, con margen por el tiempo de ejecución
        expect(Number(fila.segundos)).toBeGreaterThanOrEqual(595);
        expect(Number(fila.segundos)).toBeLessThan(660);
    });
});

describe('listar', () => {
    test('por defecto devuelve solo hoy', async () => {
        const { data, total } = await repo.listar({});
        expect(total).toBe(2);
        expect(data.every(f => f.fecha.toISOString().slice(0, 10) === HOY)).toBe(true);
    });

    test('filtra por estado efectivo, no por el estado guardado', async () => {
        // 'PENDIENTE DE CERRAR' está guardado como EN_ALMUERZO pero es de ayer:
        // debe salir al filtrar SIN_RETORNO y no al filtrar EN_ALMUERZO.
        const sinRetorno = await repo.listar({ desde: AYER, hasta: AYER, estado: 'SIN_RETORNO' });
        expect(sinRetorno.total).toBe(2);
        expect(sinRetorno.data.map(f => f.nombre).sort())
            .toEqual(['MORA JOSE LUIS', 'PENDIENTE DE CERRAR']);

        const enAlmuerzo = await repo.listar({ desde: AYER, hasta: AYER, estado: 'EN_ALMUERZO' });
        expect(enAlmuerzo.total).toBe(0);
    });

    test('el total respeta el filtro de estado', async () => {
        const { total, data } = await repo.listar({ desde: AYER, hasta: HOY, estado: 'EXCEDIDO' });
        expect(total).toBe(2);
        expect(data).toHaveLength(2);
    });

    test('busca por nombre y por ID', async () => {
        const porTexto = await repo.listar({ desde: AYER, hasta: HOY, q: 'coello' });
        expect(porTexto.total).toBe(1);
        expect(porTexto.data[0].nombre).toBe('COELLO ADRIAN');

        const porId = await repo.listar({ desde: AYER, hasta: HOY, q: '202' });
        expect(porId.total).toBe(1);
        expect(porId.data[0].nombre).toBe('YA SE PASO');
    });

    test('pagina y valida el tamaño de página', async () => {
        const p1 = await repo.listar({ desde: AYER, hasta: HOY, page: 1, pageSize: 20 });
        expect(p1.pageSize).toBe(20);
        expect(p1.total).toBe(7);
        expect(p1.data).toHaveLength(7);

        // pageSize fuera de la lista permitida cae al default
        const invalido = await repo.listar({ desde: AYER, hasta: HOY, pageSize: 9999 });
        expect(invalido.pageSize).toBe(50);

        // page inválida cae a 1
        const pagMala = await repo.listar({ desde: AYER, hasta: HOY, page: -3 });
        expect(pagMala.page).toBe(1);
    });

    test('un rango invertido se ordena en vez de devolver vacío', async () => {
        const { total } = await repo.listar({ desde: HOY, hasta: AYER });
        expect(total).toBe(7);
    });

    test('una fecha con formato inválido cae al día de hoy', async () => {
        const { data } = await repo.listar({ fecha: 'no-es-fecha' });
        expect(data).toHaveLength(2);
    });
});

describe('resumen', () => {
    test('cuenta cada estado y promedia solo a los que retornaron', async () => {
        const r = await repo.resumen({ fecha: AYER });
        expect(r.salidas).toBe(5);
        expect(r.retornos).toBe(3);
        expect(r.aTiempo).toBe(1);
        expect(r.excedidos).toBe(2);
        expect(r.sinRetorno).toBe(2);
        // Promedio de 1500, 2250 y 1840 = 1863.33 -> 1863
        expect(r.promedioSegundos).toBe(1863);
        expect(r.maximoSegundos).toBe(2250);
        expect(r.minutosPermitidos).toBe(30);
        expect(r.toleranciaMinutos).toBe(0);
    });

    test('sinMarcar suma los cerrados sin retorno y los vencidos de hoy', async () => {
        const r = await repo.resumen({ desde: AYER, hasta: HOY });
        expect(r.excedidoEnCurso).toBe(1);   // 'YA SE PASO'
        expect(r.enAlmuerzo).toBe(1);        // 'EN SU TIEMPO'
        expect(r.sinMarcar).toBe(3);         // 2 de ayer + 1 vencido de hoy
    });

    test('un rango sin datos devuelve ceros, no null', async () => {
        const r = await repo.resumen({ fecha: '2020-01-01' });
        expect(r.salidas).toBe(0);
        expect(r.retornos).toBe(0);
        expect(r.promedioSegundos).toBe(null);
    });
});

describe('zonas', () => {
    test('el listado trae la zona por JOIN con usuarios', async () => {
        const filas = await repo.listarRango({ desde: AYER, hasta: HOY });
        expect(porNombre(filas, 'ORELLANA ROGER').zona).toBe('SOLIDO');
        expect(porNombre(filas, 'MORA JOSE LUIS').zona).toBe(null);
        expect(porNombre(filas, 'YA SE PASO').zona).toBe('ADMINISTRATIVOS');
    });

    test('filtra por zona', async () => {
        const solido = await repo.listar({ desde: AYER, hasta: HOY, zona: 'SOLIDO' });
        expect(solido.total).toBe(2);
        expect(solido.data.map(f => f.nombre).sort()).toEqual(['COELLO ADRIAN', 'ORELLANA ROGER']);

        // La comparación no distingue mayúsculas
        const minusculas = await repo.listar({ desde: AYER, hasta: HOY, zona: 'liquido' });
        expect(minusculas.total).toBe(1);
    });

    test('SIN_ZONA agrupa a los no clasificados', async () => {
        const sinZona = await repo.listar({ desde: AYER, hasta: HOY, zona: 'SIN_ZONA' });
        expect(sinZona.total).toBe(1);
        expect(sinZona.data[0].nombre).toBe('MORA JOSE LUIS');
    });

    test('una zona con caracteres inválidos se ignora en vez de romper', async () => {
        const res = await repo.listar({ desde: AYER, hasta: HOY, zona: "'; DROP TABLE usuarios; --" });
        expect(res.total).toBe(7); // filtro ignorado, devuelve todo
        const [tablas] = await admin.query("SHOW TABLES LIKE 'usuarios'");
        expect(tablas).toHaveLength(1);
    });

    test('el resumen respeta el filtro de zona', async () => {
        const r = await repo.resumen({ desde: AYER, hasta: HOY, zona: 'SOLIDO' });
        expect(r.salidas).toBe(2);
        const total = await repo.resumen({ desde: AYER, hasta: HOY });
        expect(total.salidas).toBe(7);
    });

    test('configZonas devuelve catálogo, conteos y no clasificados', async () => {
        const config = await repo.configZonas();
        expect(config.zonas).toHaveLength(7);
        const solido = config.zonas.find(z => z.zona === 'SOLIDO');
        expect(solido).toEqual({ zona: 'SOLIDO', controlada: true, empleados: 2 });
        const bodega = config.zonas.find(z => z.zona === 'BODEGA');
        expect(bodega.controlada).toBe(false);
        expect(config.sinZona).toBe(1);
        expect(config.controlarSinZona).toBe(true);
        expect(config.huerfanas).toEqual([]);
    });

    test('detecta zonas asignadas que no están en el catálogo', async () => {
        await admin.query("UPDATE usuarios SET zona = 'PATIO' WHERE zk_id = '105'");
        repo.invalidarConfig();
        const config = await repo.configZonas();
        expect(config.huerfanas).toEqual([{ zona: 'PATIO', empleados: 1 }]);
        await admin.query("UPDATE usuarios SET zona = 'BODEGA' WHERE zk_id = '105'");
    });

    test('guardarConfigZonas normaliza y persiste', async () => {
        const res = await repo.guardarConfigZonas({ controladas: ['solido', ' liquido '], controlarSinZona: false });
        expect(res.ok).toBe(true);
        expect(res.controladas).toEqual(['SOLIDO', 'LIQUIDO']);

        const [filas] = await admin.query(
            "SELECT valor FROM configuracion WHERE clave = 'almuerzo_zonas_controladas'");
        expect(filas[0].valor).toBe('SOLIDO,LIQUIDO');

        const config = await repo.configZonas();
        expect(config.controlarSinZona).toBe(false);
        expect(config.zonas.find(z => z.zona === 'SOPLADO').controlada).toBe(false);

        // Restaurar
        await repo.guardarConfigZonas({
            controladas: ['SOLIDO', 'LIQUIDO', 'SOPLADO', 'MANTENIMIENTO'], controlarSinZona: true,
        });
    });

    test('guardarConfigZonas rechaza zonas fuera del catálogo', async () => {
        const res = await repo.guardarConfigZonas({ controladas: ['SOLIDO', 'PATIO'] });
        expect(res.ok).toBe(false);
        expect(res.motivo).toMatch(/PATIO/);

        // No debe haber tocado nada
        const config = await repo.configZonas();
        expect(config.zonas.find(z => z.zona === 'SOLIDO').controlada).toBe(true);
    });

    test('guardarConfigZonas rechaza algo que no sea lista', async () => {
        expect((await repo.guardarConfigZonas({ controladas: 'SOLIDO' })).ok).toBe(false);
        expect((await repo.guardarConfigZonas({})).ok).toBe(false);
    });

    test('listarEmpleados pone primero a los no clasificados', async () => {
        const filas = await repo.listarEmpleados({});
        expect(filas).toHaveLength(7);
        expect(filas[0].zona).toBe(null);   // MORA JOSE LUIS
    });

    test('listarEmpleados filtra por zona, texto y rol', async () => {
        expect(await repo.listarEmpleados({ zona: 'SOLIDO' })).toHaveLength(2);
        expect(await repo.listarEmpleados({ zona: 'SIN_ZONA' })).toHaveLength(1);
        expect(await repo.listarEmpleados({ q: 'coello' })).toHaveLength(1);
        expect(await repo.listarEmpleados({ q: '103' })).toHaveLength(1);
        expect(await repo.listarEmpleados({ role: 'Administrativo' })).toHaveLength(1);
    });

    test('asignarZona actualiza a varios a la vez', async () => {
        const res = await repo.asignarZona(['101', '102'], 'soplado');
        expect(res.ok).toBe(true);
        expect(res.actualizados).toBe(2);
        expect(res.zona).toBe('SOPLADO');

        const [filas] = await admin.query(
            "SELECT zona FROM usuarios WHERE zk_id IN ('101','102')");
        expect(filas.every(f => f.zona === 'SOPLADO')).toBe(true);

        await repo.asignarZona(['101', '102'], 'SOLIDO');
    });

    test('asignarZona con null quita la zona', async () => {
        await repo.asignarZona('105', null);
        const [filas] = await admin.query("SELECT zona FROM usuarios WHERE zk_id = '105'");
        expect(filas[0].zona).toBe(null);
        await repo.asignarZona('105', 'BODEGA');
    });

    test('asignarZona valida entrada', async () => {
        expect((await repo.asignarZona([], 'SOLIDO')).ok).toBe(false);
        expect((await repo.asignarZona(['101'], 'PATIO')).motivo).toMatch(/no está en el catálogo/);
        expect((await repo.asignarZona(['101'], 'zona; DROP TABLE usuarios')).ok).toBe(false);
    });
});

describe('cerrarManual', () => {
    test('cierra una sesión sin retorno y calcula el estado', async () => {
        const [filas] = await admin.query(
            "SELECT id FROM almuerzo_sesiones WHERE nombre = 'MORA JOSE LUIS'");
        const id = filas[0].id;

        // Salió 11:38:08; retorno 12:00 => 21:52 -> a tiempo
        const res = await repo.cerrarManual(id, {
            horaRetorno: '12:00', observacion: 'Olvidó marcar', adminNombre: 'John',
        });
        expect(res.ok).toBe(true);
        expect(res.estado).toBe('A_TIEMPO');
        expect(res.segundos).toBe(1312);

        const [check] = await admin.query(
            'SELECT hora_retorno, segundos_usados, estado, cierre_manual, observacion '
            + 'FROM almuerzo_sesiones WHERE id = ?', [id]);
        expect(check[0].estado).toBe('A_TIEMPO');
        expect(check[0].cierre_manual).toBe(1);
        expect(check[0].observacion).toContain('cierre manual: John');
    });

    test('rechaza cerrar dos veces la misma sesión', async () => {
        const [filas] = await admin.query(
            "SELECT id FROM almuerzo_sesiones WHERE nombre = 'MORA JOSE LUIS'");
        const res = await repo.cerrarManual(filas[0].id, { horaRetorno: '12:10' });
        expect(res.ok).toBe(false);
        expect(res.motivo).toMatch(/ya tiene retorno/i);
    });

    test('rechaza un retorno anterior a la salida', async () => {
        const [filas] = await admin.query(
            "SELECT id FROM almuerzo_sesiones WHERE nombre = 'PENDIENTE DE CERRAR'");
        const res = await repo.cerrarManual(filas[0].id, { horaRetorno: '10:00' });
        expect(res.ok).toBe(false);
        expect(res.motivo).toMatch(/posterior a la salida/i);
    });

    test('valida el formato de la hora y el ID', async () => {
        expect((await repo.cerrarManual(1, { horaRetorno: '25:99' })).ok).toBe(false);
        expect((await repo.cerrarManual(1, { horaRetorno: 'mediodía' })).ok).toBe(false);
        expect((await repo.cerrarManual('abc', { horaRetorno: '12:00' })).ok).toBe(false);
        expect((await repo.cerrarManual(999999, { horaRetorno: '12:00' })).motivo)
            .toMatch(/no existe/i);
    });

    test('marca EXCEDIDO cuando el cierre manual supera el límite', async () => {
        const [filas] = await admin.query(
            "SELECT id FROM almuerzo_sesiones WHERE nombre = 'PENDIENTE DE CERRAR'");
        // Salió 11:39:00; retorno 12:30 => 51 min
        const res = await repo.cerrarManual(filas[0].id, { horaRetorno: '12:30' });
        expect(res.ok).toBe(true);
        expect(res.estado).toBe('EXCEDIDO');
    });
});
