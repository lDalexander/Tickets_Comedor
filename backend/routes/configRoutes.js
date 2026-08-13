const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const { obtenerEspecialesCacheado } = require('../repositories/statsRepository');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: ADMIN_JWT_SECRET no configurada. El servidor no puede arrancar.');
    process.exit(1);
}

const verifyAdmin = (req, res, next) => {
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

// GET: IDs de usuarios especiales (VIP y Gerencia) — resultado cacheado 5 minutos
// Consumido por el worker Python al arrancar y cada 10 minutos para refrescar
router.get('/especiales', async (req, res) => {
    try {
        const especiales = await obtenerEspecialesCacheado();
        res.json(especiales);
    } catch (error) {
        logger.error('Error fetching especiales:', error);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

module.exports = router;
