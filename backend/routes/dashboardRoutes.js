const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const ExcelJS = require('exceljs');

// Helper to build date filter
const isValidDate = (dateString) => {
    const regEx = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateString.match(regEx)) return false;  // Invalid format
    const d = new Date(dateString);
    const dNum = d.getTime();
    if (!dNum && dNum !== 0) return false; // NaN value, invalid date
    return d.toISOString().slice(0, 10) === dateString;
}

const getDateFilter = (req, fieldName = 'fecha') => {
    const { startDate, endDate } = req.query;
    let sql = ` ${fieldName} = CURDATE() `; // Default: Today
    let params = [];

    if (startDate && endDate) {
        if (!isValidDate(startDate) || !isValidDate(endDate)) {
            // Fallback or error. For now fallback to today to avoid SQL error or injection attempts via weird formats
            logger.warn('Invalid date format detected, falling back to CURDATE');
            return { sql: ` ${fieldName} = CURDATE() `, params: [] };
        }
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
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ('Ticket Almuerzo', 'Ticket Extra', 'Ticket Dieta')`,
            params
        );

        // 2. Special Tickets (Dieta)
        const specialRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion IN ('Ticket Extra', 'Ticket Dieta')`,
            params
        );

        // 3. Normal Tickets (Ticket Almuerzo)
        const normalRows = await db.query(
            `SELECT COUNT(*) as total FROM registros WHERE ${dateCondition} AND descripcion = 'Ticket Almuerzo'`,
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
            totalNormal: normalRows[0]?.total || 0,
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
        let dateCondition = `fecha >= DATE_SUB(CURDATE(), INTERVAL 8 DAY)`;
        let params = [];

        if (startDate && endDate) {
            dateCondition = `fecha BETWEEN ? AND ?`;
            params = [startDate, endDate];
        }

        const sql = `
            SELECT 
                DATE(fecha) as date,
                SUM(CASE WHEN descripcion IN ('Ticket Almuerzo', 'Ticket Extra', 'Ticket Dieta') THEN 1 ELSE 0 END) as lunches,
                SUM(CASE WHEN descripcion = 'Ticket Almuerzo' THEN 1 ELSE 0 END) as type_normal,
                SUM(CASE WHEN descripcion IN ('Ticket Extra', 'Ticket Dieta') THEN 1 ELSE 0 END) as type_special
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
            if (type === 'extra') conditions.push(`descripcion = 'Ticket Extra'`);
            else if (type === 'normal') conditions.push(`descripcion = 'Ticket Almuerzo'`);
        } else {
            // Default: Show only successful tickets (Hide duplicates)
            conditions.push(`descripcion IN ('Ticket Extra', 'Ticket Almuerzo')`);
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


router.get('/stats/export-excel', async (req, res) => {
    try {
        const { startDate, endDate, type } = req.query;

        // Validation: Require Date Range
        if (!startDate || !endDate) {
            return res.status(400).send('Se requiere un rango de fechas para descargar el reporte.');
        }

        let conditions = [];
        let params = [];

        // Date Filter
        conditions.push(`fecha BETWEEN ? AND ?`);
        params.push(startDate, endDate);

        // Type Filter (matches history logic)
        if (type) {
            if (type === 'extra') conditions.push(`descripcion = 'Ticket Extra'`);
            else if (type === 'normal') conditions.push(`descripcion = 'Ticket Almuerzo'`);
        } else {
            // Default: Show only successful tickets (Hide duplicates)
            conditions.push(`descripcion IN ('Ticket Extra', 'Ticket Almuerzo')`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Query without LIMIT for export
        const sql = `
            SELECT id, nombre as user, hora as time, fecha as date, descripcion as type 
            FROM registros 
            ${whereClause}
            ORDER BY fecha DESC, hora DESC
        `;

        const rows = await db.query(sql, params);

        // Generate Workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Comedor');

        // Columns
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Usuario', key: 'user', width: 30 },
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Hora', key: 'time', width: 15 },
            { header: 'Tipo', key: 'type', width: 25 },
            { header: 'Estado', key: 'status', width: 15 },
        ];

        // Format Rows
        rows.forEach(row => {
            const rowData = {
                ...row,
                date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
                status: row.type === 'Intento de Duplicado' ? 'Bloqueado' : 'Exitoso'
            };
            worksheet.addRow(rowData);
        });

        // Headers Style
        worksheet.getRow(1).font = { bold: true };

        // Response
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + 'reporte_comedor.xlsx');

        await workbook.xlsx.write(res);
        res.end();
        logger.info(`Exported Excel report with ${rows.length} rows`);

    } catch (error) {
        logger.error('Error exporting excel', error);
        res.status(500).send('Error generating report');
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
