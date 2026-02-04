const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const pool = db.pool.promise();

// Middleware to check admin/superadmin token? 
// For now, we will rely on frontend passing a "secret" header or just open (as requested local tool),
// but the prompt asked for "levels of access". I will implement a basic header check if needed, 
// but for now I'll keep it open and let the frontend handle the "login" UI part, 
// or I can enforce a simple check here. 
// User asked: "niveles de acceso".
// Best practice: Check a header like 'X-Admin-Level'.

const checkAuth = (level) => (req, res, next) => {
    // This is a simplified "auth" for the local tool context
    // In a real app, verify JWT/Session.
    const secret = req.headers['x-admin-secret'];

    // Hardcoded secrets for this local tool as requested
    const ADMIN_SECRET = 'admin123';
    const SUPER_SECRET = 'supersecret';

    if (level === 'superadmin') {
        if (secret === SUPER_SECRET) return next();
    } else {
        // Admin level allows admin OR superadmin
        if (secret === ADMIN_SECRET || secret === SUPER_SECRET) return next();
    }

    return res.status(403).json({ error: 'Unauthorized Access' });
};

// --- GENERIC ROUTES (ADMIN) ---

// 1. List Tables
router.get('/tables', checkAuth('admin'), async (req, res) => {
    try {
        const [rows] = await pool.query('SHOW TABLES');
        // Convert to simple array
        const tables = rows.map(r => Object.values(r)[0]);
        res.json(tables);
    } catch (error) {
        logger.error('Admin: List Tables Error', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Get Table Schema (Columns)
router.get('/schema/:table', checkAuth('admin'), async (req, res) => {
    try {
        const { table } = req.params;
        const [rows] = await pool.query(`DESCRIBE ??`, [table]);
        res.json(rows);
    } catch (error) {
        logger.error('Admin: Schema Error', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Get Data (with pagination usually, but simple select * for now)
router.get('/data/:table', checkAuth('admin'), async (req, res) => {
    try {
        const { table } = req.params;
        const limit = 100; // Hard limit for safety
        const [rows] = await pool.query(`SELECT * FROM ?? ORDER BY 1 DESC LIMIT ${limit}`, [table]);
        res.json(rows);
    } catch (error) {
        logger.error('Admin: Get Data Error', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Update Row
router.put('/data/:table/:pk/:val', checkAuth('admin'), async (req, res) => {
    try {
        const { table, pk, val } = req.params;
        const updates = req.body; // { col: val, col2: val }

        if (Object.keys(updates).length === 0) return res.json({ success: true });

        const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        // Add PK to values
        values.push(val);

        await pool.query(`UPDATE ?? SET ${setClause} WHERE ?? = ?`, [table, ...values, pk]);
        res.json({ success: true });
    } catch (error) {
        logger.error('Admin: Update Error', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Delete Row
router.delete('/data/:table/:pk/:val', checkAuth('admin'), async (req, res) => {
    try {
        const { table, pk, val } = req.params;
        await pool.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pk, val]);
        res.json({ success: true });
    } catch (error) {
        logger.error('Admin: Delete Error', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Create Row
router.post('/data/:table', checkAuth('admin'), async (req, res) => {
    try {
        const { table } = req.params;
        const data = req.body;

        const cols = Object.keys(data).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        const values = Object.values(data);

        await pool.query(`INSERT INTO ?? (${cols}) VALUES (${placeholders})`, [table, ...values]);
        res.json({ success: true });
    } catch (error) {
        logger.error('Admin: Insert Error', error);
        res.status(500).json({ error: error.message });
    }
});


// --- SUPERADMIN ROUTES (RAW SQL) ---

router.post('/query', checkAuth('superadmin'), async (req, res) => {
    try {
        const { sql } = req.body;
        // Allow multiple statements? Maybe risky, but user asked for power.
        // mysql2 pool needs 'multipleStatements: true' config for that, checking db.js later.
        // For now single statement or whatever connection supports.

        const [rows, fields] = await pool.query(sql);
        res.json({ success: true, results: rows });
    } catch (error) {
        logger.error('SuperAdmin: Query Error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
