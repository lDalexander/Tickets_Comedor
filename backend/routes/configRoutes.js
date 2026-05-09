const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'comedor_admin_secret';

const verifyAdmin = (req, res, next) => {
    const secret = req.headers['x-admin-secret'];
    if (secret === 'admin123') return next();

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            jwt.verify(authHeader.slice(7), JWT_SECRET);
            return next();
        } catch {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }
    }

    res.status(403).json({ error: 'Unauthorized' });
};

// GET: Obtener toda la configuración
router.get('/', async (req, res) => {
    try {
        const rows = await db.query('SELECT clave, valor FROM configuracion');
        const config = {};
        rows.forEach(row => {
            config[row.clave] = row.valor;
        });
        res.json(config);
    } catch (error) {
        logger.error('Error fetching config:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST: Guardar configuración (Actualizar múltiples claves)
router.post('/', verifyAdmin, async (req, res) => {
    const updates = req.body; // Objeto { horario_inicio: '11:00', ... }

    if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No data provided' });
    }

    const connection = await db.pool.promise().getConnection();
    try {
        await connection.beginTransaction();

        for (const [key, value] of Object.entries(updates)) {
            // Upsert: Insertar o actualizar si existe
            await connection.query(
                'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?',
                [key, String(value), String(value)]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Configuration updated' });
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error('Error updating config:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
