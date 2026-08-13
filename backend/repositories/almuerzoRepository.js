/**
 * Consultas del control de tiempo de almuerzo (tabla `almuerzo_sesiones`).
 *
 * El worker Python solo escribe el estado definitivo cuando la persona marca su
 * retorno. Para el día en curso hace falta un estado DERIVADO: quien salió hace
 * 45 minutos y todavía no marcó sigue guardado como EN_ALMUERZO, pero ya no está
 * "dentro de su tiempo". Ese cálculo vive en `SQL_ESTADO_EFECTIVO` y es la única
 * fuente de verdad para el panel y para el reporte por correo.
 *
 * Estados efectivos:
 *   A_TIEMPO           retornó dentro del límite
 *   EXCEDIDO           retornó pasado el límite
 *   EN_ALMUERZO        salió y aún está dentro de su tiempo (solo hoy)
 *   EXCEDIDO_EN_CURSO  salió, ya pasó su tiempo y no ha marcado retorno (solo hoy)
 *   SIN_RETORNO        cerró el día sin marcar retorno
 */
const db = require('../db');
const logger = require('../utils/logger');

const CONFIG_DEFAULTS = {
    almuerzo_control_activo: 'true',
    almuerzo_minutos_permitidos: '30',
    almuerzo_tolerancia_minutos: '0',
    almuerzo_retorno_min_minutos: '8',
    almuerzo_horario_fin_retorno: '15:30',
    almuerzo_excluir_ids: '',
    almuerzo_email_activo: 'true',
    almuerzo_email_destinos: '',
};

const ESTADOS_VALIDOS = [
    'A_TIEMPO', 'EXCEDIDO', 'EN_ALMUERZO', 'EXCEDIDO_EN_CURSO', 'SIN_RETORNO',
];
const PAGE_SIZES = [20, 50, 100, 250];

// El `?` recibe el límite en segundos (permitidos + tolerancia).
const SQL_ESTADO_EFECTIVO = `
    CASE
        WHEN s.hora_retorno IS NOT NULL THEN s.estado
        WHEN s.fecha < CURDATE() THEN 'SIN_RETORNO'
        WHEN TIMESTAMPDIFF(SECOND, TIMESTAMP(s.fecha, s.hora_salida), NOW()) > ?
            THEN 'EXCEDIDO_EN_CURSO'
        ELSE 'EN_ALMUERZO'
    END`;

// Segundos consumidos: los ya cerrados usan el valor guardado; los abiertos de hoy
// se calculan contra NOW() para que el panel funcione como cronómetro en vivo.
const SQL_SEGUNDOS = `
    COALESCE(
        s.segundos_usados,
        CASE WHEN s.fecha = CURDATE()
             THEN TIMESTAMPDIFF(SECOND, TIMESTAMP(s.fecha, s.hora_salida), NOW())
        END
    )`;

const isValidDate = (valor) => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const d = new Date(valor);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
};

const isValidTime = (valor) => typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(valor);

let _cacheConfig = null;
let _cacheConfigTs = 0;
const CONFIG_TTL_MS = 60 * 1000;

/** Lee las claves `almuerzo_*` de `configuracion`, con caché de 60 s. */
async function obtenerConfig(forzar = false) {
    const ahora = Date.now();
    if (!forzar && _cacheConfig && (ahora - _cacheConfigTs) < CONFIG_TTL_MS) {
        return _cacheConfig;
    }
    const config = { ...CONFIG_DEFAULTS };
    try {
        const rows = await db.query("SELECT clave, valor FROM configuracion WHERE clave LIKE 'almuerzo_%'");
        rows.forEach(r => { config[r.clave] = r.valor; });
    } catch (error) {
        logger.error('Error leyendo configuración de almuerzo, usando defaults', error);
    }
    _cacheConfig = config;
    _cacheConfigTs = ahora;
    return config;
}

function entero(config, clave) {
    const n = parseInt(config[clave], 10);
    return Number.isFinite(n) ? n : parseInt(CONFIG_DEFAULTS[clave], 10);
}

/** Límite en segundos a partir del cual una sesión se considera excedida. */
async function limiteSegundos() {
    const config = await obtenerConfig();
    return (entero(config, 'almuerzo_minutos_permitidos') + entero(config, 'almuerzo_tolerancia_minutos')) * 60;
}

/**
 * Normaliza el rango de fechas. Sin parámetros válidos devuelve el día de hoy,
 * y si vienen invertidos los ordena en vez de devolver un rango vacío.
 */
function normalizarRango({ desde, hasta, fecha }) {
    if (isValidDate(fecha)) return { desde: fecha, hasta: fecha };
    const d = isValidDate(desde) ? desde : null;
    const h = isValidDate(hasta) ? hasta : null;
    if (d && h) return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
    if (d) return { desde: d, hasta: d };
    if (h) return { desde: h, hasta: h };
    const hoy = new Date().toISOString().slice(0, 10);
    return { desde: hoy, hasta: hoy };
}

/** Cláusulas WHERE comunes. El primer `?` del SELECT es siempre el límite. */
function construirFiltro({ desde, hasta, estado, q }, limite) {
    const condiciones = ['s.fecha BETWEEN ? AND ?'];
    const params = [limite, desde, hasta];

    if (q) {
        condiciones.push('(s.nombre LIKE ? OR s.user_id LIKE ?)');
        const like = `%${String(q).slice(0, 80)}%`;
        params.push(like, like);
    }

    // El estado efectivo es una expresión derivada, no una columna: se filtra
    // con HAVING sobre el alias ya calculado.
    const having = ESTADOS_VALIDOS.includes(estado) ? 'HAVING estado_efectivo = ?' : '';
    const paramsHaving = having ? [estado] : [];

    return { where: `WHERE ${condiciones.join(' AND ')}`, params, having, paramsHaving };
}

class AlmuerzoRepository {
    /** Listado paginado de sesiones. Devuelve { data, total, page, pageSize }. */
    async listar(query) {
        const { desde, hasta } = normalizarRango(query);
        const limite = await limiteSegundos();
        const { where, params, having, paramsHaving } = construirFiltro({ ...query, desde, hasta }, limite);

        let size = parseInt(query.pageSize, 10);
        if (!PAGE_SIZES.includes(size)) size = 50;
        let page = parseInt(query.page, 10);
        if (!Number.isFinite(page) || page < 1) page = 1;
        const offset = (page - 1) * size;

        const seleccion = `
            SELECT s.id, s.user_id, s.nombre, s.fecha,
                   s.hora_salida, s.hora_retorno, s.tipo_ticket, s.numero_ticket,
                   s.cierre_manual, s.observacion, s.origen,
                   ${SQL_SEGUNDOS} AS segundos,
                   ${SQL_ESTADO_EFECTIVO} AS estado_efectivo
            FROM almuerzo_sesiones s
            ${where}`;

        // Se cuenta sobre la misma subconsulta para que el total respete el HAVING.
        const countRows = await db.query(
            `SELECT COUNT(*) AS total FROM (${seleccion} ${having}) t`,
            [...params, ...paramsHaving]
        );
        const total = Number(countRows[0]?.total || 0);

        // size/offset ya validados: MySQL no acepta placeholders en LIMIT/OFFSET.
        const data = await db.query(
            `${seleccion} ${having}
             ORDER BY s.fecha DESC, s.hora_salida DESC
             LIMIT ${size} OFFSET ${offset}`,
            [...params, ...paramsHaving]
        );

        return { data, total, page, pageSize: size };
    }

    /** Todas las sesiones del rango, sin paginar. Para Excel y para el correo. */
    async listarRango(query) {
        const { desde, hasta } = normalizarRango(query);
        const limite = await limiteSegundos();
        const { where, params, having, paramsHaving } = construirFiltro({ ...query, desde, hasta }, limite);

        return db.query(
            `SELECT s.id, s.user_id, s.nombre, s.fecha,
                    s.hora_salida, s.hora_retorno, s.tipo_ticket, s.numero_ticket,
                    s.cierre_manual, s.observacion, s.origen,
                    ${SQL_SEGUNDOS} AS segundos,
                    ${SQL_ESTADO_EFECTIVO} AS estado_efectivo
             FROM almuerzo_sesiones s
             ${where}
             ${having}
             ORDER BY s.fecha ASC, s.hora_salida ASC`,
            [...params, ...paramsHaving]
        );
    }

    /** Totales para las tarjetas del panel. */
    async resumen(query) {
        const { desde, hasta } = normalizarRango(query);
        const limite = await limiteSegundos();
        const config = await obtenerConfig();

        const rows = await db.query(
            `SELECT
                COUNT(*) AS salidas,
                SUM(estado_efectivo = 'A_TIEMPO')          AS a_tiempo,
                SUM(estado_efectivo = 'EXCEDIDO')          AS excedidos,
                SUM(estado_efectivo = 'EN_ALMUERZO')       AS en_almuerzo,
                SUM(estado_efectivo = 'EXCEDIDO_EN_CURSO') AS excedido_en_curso,
                SUM(estado_efectivo = 'SIN_RETORNO')       AS sin_retorno,
                SUM(hora_retorno IS NOT NULL)              AS retornos,
                ROUND(AVG(CASE WHEN hora_retorno IS NOT NULL THEN segundos END)) AS promedio_segundos,
                MAX(CASE WHEN hora_retorno IS NOT NULL THEN segundos END)        AS maximo_segundos
             FROM (
                SELECT s.hora_retorno,
                       ${SQL_SEGUNDOS} AS segundos,
                       ${SQL_ESTADO_EFECTIVO} AS estado_efectivo
                FROM almuerzo_sesiones s
                WHERE s.fecha BETWEEN ? AND ?
             ) t`,
            [limite, desde, hasta]
        );

        const r = rows[0] || {};
        const num = v => Number(v || 0);
        return {
            desde,
            hasta,
            salidas: num(r.salidas),
            retornos: num(r.retornos),
            aTiempo: num(r.a_tiempo),
            excedidos: num(r.excedidos),
            enAlmuerzo: num(r.en_almuerzo),
            excedidoEnCurso: num(r.excedido_en_curso),
            sinRetorno: num(r.sin_retorno),
            // Quien no marcó: los cerrados sin retorno más los que ya se pasaron hoy
            sinMarcar: num(r.sin_retorno) + num(r.excedido_en_curso),
            promedioSegundos: r.promedio_segundos === null ? null : num(r.promedio_segundos),
            maximoSegundos: r.maximo_segundos === null ? null : num(r.maximo_segundos),
            minutosPermitidos: entero(config, 'almuerzo_minutos_permitidos'),
            toleranciaMinutos: entero(config, 'almuerzo_tolerancia_minutos'),
            controlActivo: String(config.almuerzo_control_activo).toLowerCase() === 'true',
        };
    }

    /**
     * Cierra manualmente una sesión que quedó sin marcación de retorno.
     * El estado se recalcula con el límite vigente, igual que lo haría el worker.
     */
    async cerrarManual(id, { horaRetorno, observacion, adminNombre }) {
        const sesionId = parseInt(id, 10);
        if (!Number.isFinite(sesionId)) {
            return { ok: false, motivo: 'ID inválido' };
        }
        if (!isValidTime(horaRetorno)) {
            return { ok: false, motivo: 'Hora de retorno inválida (formato HH:MM)' };
        }

        const hora = horaRetorno.length === 5 ? `${horaRetorno}:00` : horaRetorno;

        // La aritmética de tiempos la hace MySQL: mysql2 devuelve TIME como string
        // y convertirlo en JS invita a errores de formato.
        const filas = await db.query(
            `SELECT id, hora_retorno, TIME_TO_SEC(TIMEDIFF(?, hora_salida)) AS segundos
               FROM almuerzo_sesiones WHERE id = ?`,
            [hora, sesionId]
        );
        if (filas.length === 0) return { ok: false, motivo: 'La sesión no existe' };
        if (filas[0].hora_retorno !== null) {
            return { ok: false, motivo: 'La sesión ya tiene retorno registrado' };
        }

        const segundos = Number(filas[0].segundos);
        if (!Number.isFinite(segundos) || segundos <= 0) {
            return { ok: false, motivo: 'El retorno debe ser posterior a la salida' };
        }

        const limite = await limiteSegundos();
        const estado = segundos > limite ? 'EXCEDIDO' : 'A_TIEMPO';
        const nota = [observacion, adminNombre ? `(cierre manual: ${adminNombre})` : null]
            .filter(Boolean).join(' ').slice(0, 255) || null;

        const res = await db.query(
            `UPDATE almuerzo_sesiones
                SET hora_retorno = ?, segundos_usados = ?, estado = ?, cierre_manual = 1, observacion = ?
              WHERE id = ? AND hora_retorno IS NULL`,
            [hora, segundos, estado, nota, sesionId]
        );
        if (res.affectedRows === 0) {
            return { ok: false, motivo: 'La sesión ya fue cerrada por otro proceso' };
        }
        return { ok: true, estado, segundos };
    }

    /** Invalida la caché de configuración (tras guardar desde el panel). */
    invalidarConfig() {
        _cacheConfig = null;
        _cacheConfigTs = 0;
    }
}

const repositorio = new AlmuerzoRepository();

module.exports = {
    listar: (q) => repositorio.listar(q),
    listarRango: (q) => repositorio.listarRango(q),
    resumen: (q) => repositorio.resumen(q),
    cerrarManual: (id, datos) => repositorio.cerrarManual(id, datos),
    invalidarConfig: () => repositorio.invalidarConfig(),
    obtenerConfig,
    normalizarRango,
    ESTADOS_VALIDOS,
};
