const db = require('../db');
const logger = require('../utils/logger');

const isValidDate = (dateString) => {
    const regEx = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateString.match(regEx)) return false;
    const d = new Date(dateString);
    const dNum = d.getTime();
    if (!dNum && dNum !== 0) return false;
    return d.toISOString().slice(0, 10) === dateString;
}

const getDateFilter = (req, fieldName = 'fecha') => {
    const { startDate, endDate } = req.query;
    let sql = ` ${fieldName} = CURDATE() `;
    let params = [];

    if (startDate && endDate) {
        if (!isValidDate(startDate) || !isValidDate(endDate)) {
            logger.warn('Invalid date format detected, falling back to CURDATE');
            return { sql: ` ${fieldName} = CURDATE() `, params: [] };
        }
        sql = ` ${fieldName} BETWEEN ? AND ? `;
        params = [startDate, endDate];
    } else if (req.path && req.path.includes('/daily')) {
        sql = ` ${fieldName} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) `;
        params = [];
    }
    return { sql, params };
};

// All valid ticket descriptions (old lowercase + new uppercase)
const ALL_TICKETS = "('Ticket Almuerzo', 'Ticket Extra', 'Ticket Dieta', 'TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA', 'TICKET TERCERO')";
const NORMAL_TICKETS = "('Ticket Almuerzo', 'TICKET ALMUERZO')";
const DIETA_TICKETS = "('Ticket Dieta', 'TICKET DIETA')";
const GERENCIA_TICKETS = "('TICKET GERENCIA')";
const VISITA_TICKETS = "('TICKET VISITA')";
const EXTRA_TICKETS = "('Ticket Extra', 'TICKET EXTRA')";
const TERCERO_TICKETS = "('TICKET TERCERO')";

let _cacheEspeciales = null;
let _cacheEspecialesTs = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function obtenerEspecialesCacheado() {
    if (_cacheEspeciales && (Date.now() - _cacheEspecialesTs < CACHE_TTL)) {
        return _cacheEspeciales;
    }
    const rows = await db.query(
        'SELECT zk_id, tipo_especial FROM usuarios WHERE tipo_especial IS NOT NULL'
    );
    _cacheEspeciales = {
        vips:     rows.filter(r => r.tipo_especial === 'VIP').map(r => String(r.zk_id)),
        gerencia: rows.filter(r => r.tipo_especial === 'GERENCIA').map(r => String(r.zk_id))
    };
    _cacheEspecialesTs = Date.now();
    return _cacheEspeciales;
}

class StatsRepository {
    async getSummary(req) {
        const { sql: dateCondition, params } = getDateFilter(req);

        const totalRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ${ALL_TICKETS}`,
            params
        );
        const normalRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ${NORMAL_TICKETS}`,
            params
        );
        const dietaRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ${DIETA_TICKETS}`,
            params
        );
        const gerenciaRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ${GERENCIA_TICKETS}`,
            params
        );
        const visitaRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ${VISITA_TICKETS}`,
            params
        );
        const extraRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ${EXTRA_TICKETS}`,
            params
        );
        const terceroRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ${TERCERO_TICKETS}`,
            params
        );
        const popRows = await db.query(
            // Solo tipos de ticket: 'RETORNO ALMUERZO' es una marcación de control de
            // tiempo, no un consumo, y con ~60 al día distorsionaría el tipo más popular.
            `SELECT descripcion, COUNT(*) as count FROM registros WHERE ${dateCondition} AND descripcion IN ${ALL_TICKETS} GROUP BY descripcion ORDER BY count DESC LIMIT 1`,
            params
        );

        return {
            totalLunches: totalRows[0]?.total || 0,
            totalNormal: normalRows[0]?.total || 0,
            totalDieta: dietaRows[0]?.total || 0,
            totalGerencia: gerenciaRows[0]?.total || 0,
            totalVisita: visitaRows[0]?.total || 0,
            totalExtra: extraRows[0]?.total || 0,
            totalTercero: terceroRows[0]?.total || 0,
            // Legacy fields for backwards compat
            totalSpecial: (dietaRows[0]?.total || 0) + (gerenciaRows[0]?.total || 0) + (visitaRows[0]?.total || 0),
            mostPopularType: popRows[0]?.descripcion || 'N/A'
        };
    }

    async getDaily(req) {
        const { startDate, endDate } = req.query;
        let dateCondition = `fecha >= DATE_SUB(CURDATE(), INTERVAL 8 DAY)`;
        let params = [];
        if (startDate && endDate) {
            dateCondition = `fecha BETWEEN ? AND ?`;
            params = [startDate, endDate];
        }
        const sql = `
            SELECT 
                DATE(fecha) as date,
                SUM(CASE WHEN descripcion IN ${ALL_TICKETS} THEN 1 ELSE 0 END) as lunches,
                SUM(CASE WHEN descripcion IN ${NORMAL_TICKETS} THEN 1 ELSE 0 END) as type_normal,
                SUM(CASE WHEN descripcion IN ${DIETA_TICKETS} THEN 1 ELSE 0 END) as type_dieta,
                SUM(CASE WHEN descripcion IN ${GERENCIA_TICKETS} THEN 1 ELSE 0 END) as type_gerencia,
                SUM(CASE WHEN descripcion IN ${VISITA_TICKETS} THEN 1 ELSE 0 END) as type_visita,
                SUM(CASE WHEN descripcion IN ${EXTRA_TICKETS} THEN 1 ELSE 0 END) as type_extra
            FROM registros 
            WHERE ${dateCondition}
            GROUP BY DATE(fecha)
            ORDER BY date ASC
        `;
        return await db.query(sql, params);
    }

    async getHistory(req) {
        const { startDate, endDate, type, page, pageSize } = req.query;
        let conditions = [];
        let params = [];
        if (startDate && endDate) {
            conditions.push(`fecha BETWEEN ? AND ?`);
            params.push(startDate, endDate);
        } else {
            conditions.push(`fecha = CURDATE()`);
        }
        if (type) {
            if (type === 'extra') conditions.push(`descripcion IN ${EXTRA_TICKETS}`);
            else if (type === 'normal') conditions.push(`descripcion IN ${NORMAL_TICKETS}`);
            else if (type === 'dieta') conditions.push(`descripcion IN ${DIETA_TICKETS}`);
            else if (type === 'gerencia') conditions.push(`descripcion IN ${GERENCIA_TICKETS}`);
            else if (type === 'visita') conditions.push(`descripcion IN ${VISITA_TICKETS}`);
            else if (type === 'tercero') conditions.push(`descripcion IN ${TERCERO_TICKETS}`);
        } else {
            conditions.push(`descripcion IN ${ALL_TICKETS}`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Modo paginado: si el cliente envía `page`, devolvemos {data, total, page, pageSize}.
        // Si no, se mantiene el comportamiento antiguo (array plano con LIMIT 100).
        if (page !== undefined) {
            const ALLOWED_SIZES = [20, 50, 100, 250];
            let size = parseInt(pageSize, 10);
            if (!ALLOWED_SIZES.includes(size)) size = 20;
            let pageNum = parseInt(page, 10);
            if (!Number.isFinite(pageNum) || pageNum < 1) pageNum = 1;
            const offset = (pageNum - 1) * size;

            const countRows = await db.query(
                `SELECT COUNT(*) as total FROM registros ${whereClause}`,
                params
            );
            const total = Number(countRows[0]?.total || 0);

            // size y offset son enteros ya validados -> se interpolan directamente
            // (MySQL no acepta placeholders en LIMIT/OFFSET con sentencias preparadas).
            const dataSql = `
                SELECT id, nombre as user, hora as time, fecha as date, descripcion as type, numero_ticket
                FROM registros
                ${whereClause}
                ORDER BY id DESC
                LIMIT ${size} OFFSET ${offset}
            `;
            const data = await db.query(dataSql, params);
            return { data, total, page: pageNum, pageSize: size };
        }

        const sql = `
            SELECT id, nombre as user, hora as time, fecha as date, descripcion as type, numero_ticket
            FROM registros
            ${whereClause}
            ORDER BY id DESC
            LIMIT 100
        `;
        return await db.query(sql, params);
    }

    async getExport(req) {
        const { startDate, endDate, type } = req.query;
        let conditions = [];
        let params = [];
        conditions.push(`fecha BETWEEN ? AND ?`);
        params.push(startDate, endDate);
        if (type) {
            if (type === 'extra') conditions.push(`descripcion IN ${EXTRA_TICKETS}`);
            else if (type === 'normal') conditions.push(`descripcion IN ${NORMAL_TICKETS}`);
            else if (type === 'dieta') conditions.push(`descripcion IN ${DIETA_TICKETS}`);
            else if (type === 'gerencia') conditions.push(`descripcion IN ${GERENCIA_TICKETS}`);
            else if (type === 'visita') conditions.push(`descripcion IN ${VISITA_TICKETS}`);
            else if (type === 'tercero') conditions.push(`descripcion IN ${TERCERO_TICKETS}`);
        } else {
            conditions.push(`descripcion NOT IN ('INTENTO DE DUPLICADO', 'Intento de Duplicado')`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `
            SELECT id, nombre as user, hora as time, fecha as date, descripcion as type, numero_ticket 
            FROM registros 
            ${whereClause}
            ORDER BY fecha DESC, hora DESC
        `;
        return await db.query(sql, params);
    }
}

module.exports = new StatsRepository();
module.exports.obtenerEspecialesCacheado = obtenerEspecialesCacheado;
