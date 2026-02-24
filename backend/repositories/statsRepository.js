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

class StatsRepository {
    async getSummary(req) {
        const { sql: dateCondition, params } = getDateFilter(req);
        const lunchesRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ('Ticket Almuerzo', 'Ticket Extra', 'Ticket Dieta', 'TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA')`,
            params
        );
        const specialRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ('Ticket Extra', 'Ticket Dieta', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA')`,
            params
        );
        const normalRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ('Ticket Almuerzo', 'TICKET ALMUERZO')`,
            params
        );
        const popRows = await db.query(
            `SELECT descripcion, COUNT(*) as count FROM registros WHERE ${dateCondition} AND descripcion NOT IN ('INTENTO DE DUPLICADO', 'Intento de Duplicado') GROUP BY descripcion ORDER BY count DESC LIMIT 1`,
            params
        );
        return {
            totalLunches: lunchesRows[0]?.total || 0,
            totalSpecial: specialRows[0]?.total || 0,
            totalNormal: normalRows[0]?.total || 0,
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
                SUM(CASE WHEN descripcion IN ('Ticket Almuerzo', 'Ticket Extra', 'Ticket Dieta', 'TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA') THEN 1 ELSE 0 END) as lunches,
                SUM(CASE WHEN descripcion IN ('Ticket Almuerzo', 'TICKET ALMUERZO') THEN 1 ELSE 0 END) as type_normal,
                SUM(CASE WHEN descripcion IN ('Ticket Extra', 'Ticket Dieta', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA') THEN 1 ELSE 0 END) as type_special
            FROM registros 
            WHERE ${dateCondition}
            GROUP BY DATE(fecha)
            ORDER BY date ASC
        `;
        return await db.query(sql, params);
    }

    async getHistory(req) {
        const { startDate, endDate, type } = req.query;
        let conditions = [];
        let params = [];
        if (startDate && endDate) {
            conditions.push(`fecha BETWEEN ? AND ?`);
            params.push(startDate, endDate);
        } else {
            conditions.push(`fecha = CURDATE()`);
        }
        if (type) {
            if (type === 'extra') conditions.push(`descripcion = 'TICKET EXTRA'`);
            else if (type === 'normal') conditions.push(`descripcion = 'TICKET ALMUERZO'`);
        } else {
            conditions.push(`descripcion IN ('TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA', 'Ticket Almuerzo', 'Ticket Extra', 'Ticket Dieta')`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
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
            if (type === 'extra') conditions.push(`descripcion = 'TICKET EXTRA'`);
            else if (type === 'normal') conditions.push(`descripcion = 'TICKET ALMUERZO'`);
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
