const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const pool = db.pool.promise();
const { exec } = require('child_process');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'comedor_admin_secret';

// --- MIDDLEWARE DE AUTENTICACIÓN ---
// Acepta: header x-admin-secret (legacy) O Bearer JWT (nuevo panel)
const checkAuth = (level) => (req, res, next) => {
    const secret = req.headers['x-admin-secret'];
    if (secret) {
        const ADMIN_SECRET = 'admin123';
        const SUPER_SECRET = 'supersecret';
        if (level === 'superadmin') {
            if (secret === SUPER_SECRET) return next();
        } else {
            if (secret === ADMIN_SECRET || secret === SUPER_SECRET) return next();
        }
        return res.status(403).json({ error: 'Unauthorized Access' });
    }

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.adminUser = decoded;
            if (level === 'superadmin' && decoded.rol !== 'superadmin') {
                return res.status(403).json({ error: 'Se requiere acceso superadmin' });
            }
            return next();
        } catch {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }
    }

    return res.status(403).json({ error: 'Unauthorized Access' });
};

// --- LOGIN JWT ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Credenciales requeridas' });
    }
    try {
        const [rows] = await pool.query(
            "SELECT * FROM usuarios_impresion_manual WHERE username = ? AND activo = 1 AND rol = 'admin'",
            [username]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado o sin permisos de administrador' });
        }
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        const token = jwt.sign(
            { id: user.id, nombre: user.nombre_real, rol: user.rol },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        logger.info(`Admin login: ${user.username} (ID: ${user.id})`);
        res.json({ success: true, token, user: { id: user.id, nombre: user.nombre_real, rol: user.rol } });
    } catch (error) {
        logger.error('Admin login error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// --- RUTAS ADMIN ---

router.get('/tables', checkAuth('admin'), async (req, res) => {
    try {
        const [rows] = await pool.query('SHOW TABLES');
        res.json(rows.map(r => Object.values(r)[0]));
    } catch (error) {
        logger.error('Admin: List Tables Error', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/schema/:table', checkAuth('admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`DESCRIBE ??`, [req.params.table]);
        res.json(rows);
    } catch (error) {
        logger.error('Admin: Schema Error', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/data/:table', checkAuth('admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY 1 DESC LIMIT 2000`,
            [req.params.table]
        );
        res.json(rows);
    } catch (error) {
        logger.error('Admin: Get Data Error', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/data/:table/:pk/:val', checkAuth('admin'), async (req, res) => {
    try {
        const { table, pk, val } = req.params;
        const updates = req.body;

        if (table === 'usuarios_impresion_manual' && updates.password_hash) {
            if (updates.password_hash.length < 50) {
                updates.password_hash = await bcrypt.hash(updates.password_hash, 10);
            }
        }

        if (Object.keys(updates).length === 0) return res.json({ success: true });

        const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);
        await pool.query(`UPDATE ?? SET ${setClause} WHERE ?? = ?`, [table, ...values, pk, val]);
        res.json({ success: true });
    } catch (error) {
        logger.error('Admin: Update Error', error);
        res.status(500).json({ error: error.message });
    }
});

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

router.post('/data/:table', checkAuth('admin'), async (req, res) => {
    try {
        const { table } = req.params;
        const data = req.body;

        if (table === 'usuarios_impresion_manual' && data.password_hash) {
            data.password_hash = await bcrypt.hash(data.password_hash, 10);
        }

        const cols = Object.keys(data).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        await pool.query(`INSERT INTO ?? (${cols}) VALUES (${placeholders})`, [table, ...Object.values(data)]);
        res.json({ success: true });
    } catch (error) {
        logger.error('Admin: Insert Error', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/reprint', checkAuth('admin'), async (req, res) => {
    try {
        const { name, date, time, type, ticket_number } = req.body;
        if (!name || !date || !time || !type || !ticket_number) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const pythonScript = path.resolve(__dirname, '../python_core/reprint_ticket.py');
        const venvPython = path.resolve(__dirname, '../python_core/venv/bin/python');
        const args = [
            '--name', `"${name}"`,
            '--date', `"${date}"`,
            '--time', `"${time}"`,
            '--type', `"${type}"`,
            '--ticket_number', `"${ticket_number}"`
        ].join(' ');
        const command = `"${venvPython}" "${pythonScript}" ${args}`;
        logger.info(`Executing reprint: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                logger.error(`Reprint Error: ${error.message}`);
                return res.status(500).json({ error: 'Failed to reprint ticket', details: stderr });
            }
            if (stderr) logger.warn(`Reprint Stderr: ${stderr}`);
            res.json({ success: true, message: 'Ticket sent to printer' });
        });
    } catch (error) {
        logger.error('Admin: Reprint Error', error);
        res.status(500).json({ error: error.message });
    }
});

// --- RUTAS SUPERADMIN ---

router.post('/query', checkAuth('superadmin'), async (req, res) => {
    try {
        const { sql } = req.body;
        const [rows] = await pool.query(sql);
        res.json({ success: true, results: rows });
    } catch (error) {
        logger.error('SuperAdmin: Query Error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
