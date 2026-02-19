
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

// --- MIDDLEWARE DE AUTENTICACIÓN (JWT O SIMPLIFICADO) ---
// Para este sub-modulo, usaremos un token simple o sesión simulada si no hay JWT global.
// El frontend enviará el ID del usuario manual en el body o header 'x-manual-user-id' para validar quien imprime.

// --- CRUD USUARIOS (Solo Admin General) ---

// Listar usuarios manuales
router.get('/users', async (req, res) => {
    try {
        const rows = await db.query('SELECT id, username, nombre_real, activo, created_at FROM usuarios_impresion_manual');
        res.json(rows);
    } catch (error) {
        logger.error('Error fetching manual users:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Crear usuario manual
router.post('/users', async (req, res) => {
    const { username, password, nombre_real } = req.body;
    if (!username || !password || !nombre_real) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO usuarios_impresion_manual (username, password_hash, nombre_real) VALUES (?, ?, ?)',
            [username, hash, nombre_real]
        );
        res.json({ success: true, message: 'Usuario creado' });
    } catch (error) {
        logger.error('Error creating user:', error);
        res.status(500).json({ error: 'Database error or duplicate username' });
    }
});

// Editar usuario
router.put('/users/:id', async (req, res) => {
    const { password, nombre_real, activo } = req.body;
    try {
        let query = 'UPDATE usuarios_impresion_manual SET nombre_real = ?, activo = ?';
        let params = [nombre_real, activo];

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            query += ', password_hash = ?';
            params.push(hash);
        }

        query += ' WHERE id = ?';
        params.push(req.params.id);

        await db.query(query, params);
        res.json({ success: true, message: 'Usuario actualizado' });
    } catch (error) {
        logger.error('Error updating user:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Eliminar (Desactivar)
router.delete('/users/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM usuarios_impresion_manual WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Usuario eliminado' });
    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({ error: 'Database error' });
    }
});


// --- LOGIN MÓDULO VISITAS ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const rows = await db.query('SELECT * FROM usuarios_impresion_manual WHERE username = ? AND activo = 1', [username]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            // Retornar datos básicos para sesión en frontend
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    nombre_real: user.nombre_real
                }
            });
        } else {
            res.status(401).json({ error: 'Contraseña incorrecta' });
        }
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- IMPRIMIR TICKET VISITA ---
router.post('/print', async (req, res) => {
    const { visitorName, printedByUserId } = req.body;

    if (!visitorName || !printedByUserId) {
        return res.status(400).json({ error: 'Missing data' });
    }

    try {
        // 1. Verificar usuario
        const rows = await db.query('SELECT nombre_real FROM usuarios_impresion_manual WHERE id = ?', [printedByUserId]);
        if (rows.length === 0) {
            return res.status(403).json({ error: 'Usuario no autorizado' });
        }
        const nombreAutoriza = rows[0].nombre_real;

        // --- VERIFICACIÓN DE HORARIO ---
        try {
            const configRows = await db.query("SELECT clave, valor FROM configuracion");
            const config = {};
            configRows.forEach(c => config[c.clave] = c.valor);

            if (config['horario_activo'] === 'true') {
                const now = new Date();
                // Ajuste de zona horaria (UTC-5 para Ecuador, o la del servidor)
                // Asumimos hora del servidor es correcta o usamos hora local string
                const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
                const start = config['horario_inicio'] || '00:00';
                const end = config['horario_fin'] || '23:59';

                if (currentTime < start || currentTime > end) {
                    return res.status(403).json({
                        error: `Fuera de horario de servicio (${start} - ${end})`
                    });
                }
            }
        } catch (err) {
            logger.error("Error checking schedule config", err);
            // Si falla la config, permitimos por defecto o bloqueamos? 
            // Mejor loguear y continuar para no detener operación por error de config, o al revés.
        }


        // 2. Calcular número de ticket (Lógica idéntica a Python para llenar huecos)
        const today = new Date();
        // Ajuste manual de zona horaria si es necesario, o confiar en que el servidor tiene la hora correcta.
        // Simulamos la fecha local YYYY-MM-DD
        const offset = today.getTimezoneOffset() * 60000; // offset en milisegundos
        const localDate = new Date(today.getTime() - offset);
        const fechaStr = localDate.toISOString().split('T')[0];

        // Consultar números usados hoy
        const usedRows = await db.query(
            `SELECT numero_ticket FROM registros 
             WHERE fecha = ? 
             AND descripcion IN ('TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA') 
             ORDER BY numero_ticket ASC`,
            [fechaStr]
        );

        const usedNumbers = usedRows.map(r => r.numero_ticket);
        let ticketNumber = 1;
        for (const n of usedNumbers) {
            if (n === ticketNumber) {
                ticketNumber++;
            } else if (n > ticketNumber) {
                break; // Hueco encontrado
            }
        }

        // 3. Insertar en log_tickets_manuales (Auditoría específica)
        await db.query(
            'INSERT INTO log_tickets_manuales (nombre_visitante, impreso_por_usuario_id) VALUES (?, ?)',
            [visitorName, printedByUserId]
        );

        // 4. Insertar en tabla PRINCIPAL `registros`
        // Usamos un ID ficticio para evitar colisión con ZK IDs numéricos. Ej: "VISITA_{timestamp}"
        const fakeUserId = `VISITA_${Date.now()}`;
        const horaStr = localDate.toTimeString().split(' ')[0];

        await db.query(
            'INSERT INTO registros (user_id, nombre, fecha, hora, descripcion, numero_ticket) VALUES (?, ?, ?, ?, ?, ?)',
            [fakeUserId, visitorName, fechaStr, horaStr, 'TICKET VISITA', ticketNumber]
        );

        // 5. Ejecutar script Python de impresión
        const pythonScript = path.resolve(__dirname, '../python_core/reprint_ticket.py');
        const venvPython = path.resolve(__dirname, '../python_core/venv/bin/python');

        const args = [
            '--name', `"${visitorName}"`,
            '--type', '"TICKET VISITA"',
            '--autoriza', `"${nombreAutoriza}"`,
            '--ticket_number', ticketNumber
        ].join(' ');

        const command = `"${venvPython}" "${pythonScript}" ${args}`;

        logger.info(`Printing Visitor Ticket #${ticketNumber}: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                logger.error(`Print Error: ${error.message}`);
                return res.status(500).json({ error: 'Error imprimiendo ticket', details: stderr });
            }
            res.json({ success: true, message: `Ticket #${ticketNumber} enviado a impresión` });
        });

    } catch (error) {
        logger.error('Error processing manual ticket:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
