const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const ExcelJS = require('exceljs');
const statsRepository = require('../repositories/statsRepository');

router.get('/stats/summary', async (req, res) => {
    try {
        const stats = await statsRepository.getSummary(req);
        res.json(stats);
        logger.info('Fetched summary stats from DB');
    } catch (error) {
        logger.error('Error fetching summary stats', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

router.get('/stats/daily', async (req, res) => {
    try {
        const rows = await statsRepository.getDaily(req);

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
        const rows = await statsRepository.getHistory(req);

        const formattedRows = rows.map(r => ({
            ...r,
            date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
            status: r.type === 'Intento de Duplicado' ? 'Bloqueado' : 'Exitoso'
        }));

        res.json(formattedRows);
        logger.info(`Fetched history logs with type=${req.query.type || 'all'}`);
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

        const rows = await statsRepository.getExport(req);

        // Generate Workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Comedor');

        // Columns
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'N° Ticket', key: 'ticket', width: 10 },
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
                status: row.type === 'Intento de Duplicado' ? 'Bloqueado' : 'Exitoso',
                ticket: row.numero_ticket || '-'
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
