const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');

// Helper to build date filter
const getDateFilter = (req, fieldName = 'fecha') => {
    const { startDate, endDate } = req.query;
    let sql = ` ${fieldName} = CURDATE() `; // Default: Today
    let params = [];

    if (startDate && endDate) {
        sql = ` ${fieldName} BETWEEN ? AND ? `;
        params = [startDate, endDate];
    } else if (req.path.includes('/daily')) {
        // Default for daily trend: Last 7 days
        sql = ` ${fieldName} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) `;
        params = [];
    }
    
    return { sql, params };
};

router.get('/stats/summary', async (req, res) => {
    try {
        const { sql: dateCondition, params } = getDateFilter(req);

        // 1. Total Lunches
        const lunchesRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ('Ticket Almuerzo', 'Ticket Extra')`,
            params
        );
        
        // 2. Special Tickets (replacing Printed Tickets redundancy)
        const specialRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion = 'Ticket Extra'`,
            params
        );

        // 3. Duplicates Attempted
        const dupsRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion = 'Intento de Duplicado'`,
            params
        );

        // 4. Most Popular Type
        const popRows = await db.query(
            `SELECT descripcion, COUNT(*) as count FROM registros WHERE ${dateCondition} AND descripcion IN ('Ticket Almuerzo', 'Ticket Extra') GROUP BY descripcion ORDER BY count DESC LIMIT 1`,
            params
        );

        res.json({
            totalLunches: lunchesRows[0]?.total || 0,
            totalSpecial: specialRows[0]?.total || 0,
            duplicatesAttempted: dupsRows[0]?.total || 0,
            mostPopularType: popRows[0]?.descripcion || 'N/A'
        });
        logger.info('Fetched summary stats from DB');
    } catch (error) {
        logger.error('Error fetching summary stats', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

router.get('/stats/daily', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateCondition = `fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
        let params = [];

        if (startDate && endDate) {
            dateCondition = `fecha BETWEEN ? AND ?`;
            params = [startDate, endDate];
        }

        const sql = `
            SELECT 
                DATE(fecha) as date,
                SUM(CASE WHEN descripcion IN ('Ticket Almuerzo', 'Ticket Extra') THEN 1 ELSE 0 END) as lunches,
                SUM(CASE WHEN descripcion = 'Ticket Almuerzo' THEN 1 ELSE 0 END) as type_normal,
                SUM(CASE WHEN descripcion = 'Ticket Extra' THEN 1 ELSE 0 END) as type_special
            FROM registros 
            WHERE ${dateCondition}
            GROUP BY DATE(fecha)
            ORDER BY date ASC
        `;
        const rows = await db.query(sql, params);
        
        const formattedRows = rows.map(r => ({
            ...r,
            date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date
        }));

        res.json(formattedRows);
    } catch (error) {
        logger.error('Error fetching daily stats', error);
        res.status(500).json([]);
    }
});


router.get('/stats/history', async (req, res) => {
    try {
        const { startDate, endDate, type } = req.query;
        let conditions = [];
        let params = [];

        // Date Filter
        if (startDate && endDate) {
            conditions.push(`fecha BETWEEN ? AND ?`);
            params.push(startDate, endDate);
        } else {
            conditions.push(`fecha = CURDATE()`); // Default: Today
        }

        // Type Filter
        if (type) {
            if (type === 'duplicate') conditions.push(`descripcion = 'Intento de Duplicado'`);
            else if (type === 'extra') conditions.push(`descripcion = 'Ticket Extra'`);
            else if (type === 'normal') conditions.push(`descripcion = 'Ticket Almuerzo'`);
        } else {
            // Default: Show all relevant types
            conditions.push(`descripcion IN ('Intento de Duplicado', 'Ticket Extra', 'Ticket Almuerzo')`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT id, nombre as user, hora as time, fecha as date, descripcion as type 
            FROM registros 
            ${whereClause}
            ORDER BY fecha DESC, hora DESC 
            LIMIT 100
        `;
        
        const rows = await db.query(sql, params);
        
        const formattedRows = rows.map(r => ({
            ...r,
            date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
            status: r.type === 'Intento de Duplicado' ? 'Bloqueado' : 'Exitoso'
        }));

        res.json(formattedRows);
        logger.info(`Fetched history logs with type=${type || 'all'}`);
    } catch (error) {
        logger.error('Error fetching history logs', error);
        res.status(500).json([]);
    }
});

router.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'online', message: 'Database Connected' });
    } catch (error) {
        logger.error('Health check failed', error);
        res.status(500).json({ status: 'offline', message: 'Database Disconnected' });
    }
});

module.exports = router;
