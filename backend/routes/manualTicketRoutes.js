
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

// --- Permisos válidos del sistema ---
const PERMISOS_VALIDOS = ['superadmin', 'admin', 'visita', 'tercero'];

// Normaliza una lista de permisos (array o string separada por comas) a un
// string "a,b,c" dejando solo los permisos válidos y sin duplicados.
function normalizarPermisos(input) {
    let lista = [];
    if (Array.isArray(input)) lista = input;
    else if (typeof input === 'string') lista = input.split(',');
    const limpios = lista
        .map(p => String(p).trim().toLowerCase())
        .filter(p => PERMISOS_VALIDOS.includes(p));
    return [...new Set(limpios)].join(',');
}

function tienePermiso(permisosStr, permiso) {
    return String(permisosStr || '')
        .split(',')
        .map(p => p.trim().toLowerCase())
        .includes(permiso);
}

// Listar usuarios manuales
router.get('/users', async (req, res) => {
    try {
        const rows = await db.query('SELECT id, username, nombre_real, activo, rol, permisos, created_at FROM usuarios_impresion_manual');
        res.json(rows);
    } catch (error) {
        logger.error('Error fetching manual users:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Crear usuario manual
router.post('/users', async (req, res) => {
    const { username, password, nombre_real, permisos } = req.body;
    if (!username || !password || !nombre_real) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        const permisosStr = normalizarPermisos(permisos);
        // rol se mantiene por compatibilidad: 'admin' si tiene acceso al panel.
        const rol = (tienePermiso(permisosStr, 'admin') || tienePermiso(permisosStr, 'superadmin')) ? 'admin' : 'operador';
        await db.query(
            'INSERT INTO usuarios_impresion_manual (username, password_hash, nombre_real, rol, permisos) VALUES (?, ?, ?, ?, ?)',
            [username, hash, nombre_real, rol, permisosStr]
        );
        res.json({ success: true, message: 'Usuario creado' });
    } catch (error) {
        logger.error('Error creating user:', error);
        res.status(500).json({ error: 'Database error or duplicate username' });
    }
});

// Editar usuario
router.put('/users/:id', async (req, res) => {
    const { password, nombre_real, activo, permisos } = req.body;
    try {
        let sets = ['nombre_real = ?', 'activo = ?'];
        let params = [nombre_real, activo];

        // Si se envían permisos, se actualizan y se mantiene `rol` en sincronía.
        if (permisos !== undefined) {
            const permisosStr = normalizarPermisos(permisos);
            const rol = (tienePermiso(permisosStr, 'admin') || tienePermiso(permisosStr, 'superadmin')) ? 'admin' : 'operador';
            sets.push('permisos = ?', 'rol = ?');
            params.push(permisosStr, rol);
        }

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            sets.push('password_hash = ?');
            params.push(hash);
        }

        params.push(req.params.id);
        await db.query(`UPDATE usuarios_impresion_manual SET ${sets.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'Usuario actualizado' });
    } catch (error) {
        logger.error('Error updating user:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Eliminar operador. Un SUPER ADMIN no se puede borrar desde el panel (solo desde la BD).
router.delete('/users/:id', async (req, res) => {
    try {
        const rows = await db.query('SELECT permisos FROM usuarios_impresion_manual WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        if (tienePermiso(rows[0].permisos, 'superadmin')) {
            return res.status(403).json({ error: 'No se puede eliminar un SUPER ADMIN desde el panel. Hazlo directamente en la base de datos.' });
        }
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
            // Mensaje genérico: no revelar si el usuario existe
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
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
                    nombre_real: user.nombre_real,
                    permisos: user.permisos || ''
                }
            });
        } else {
            res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
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
        const rows = await db.query('SELECT nombre_real, permisos, activo FROM usuarios_impresion_manual WHERE id = ?', [printedByUserId]);
        if (rows.length === 0 || !rows[0].activo) {
            return res.status(403).json({ error: 'Usuario no autorizado' });
        }
        if (!tienePermiso(rows[0].permisos, 'visita')) {
            return res.status(403).json({ error: 'No tienes permiso para imprimir tickets de visita' });
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
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const fechaStr = `${year}-${month}-${day}`;

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
        const horaStr = today.toTimeString().split(' ')[0];

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
                logger.error(`Print Error: ${error.message}`, { stderr });
                return res.status(500).json({ error: 'Error imprimiendo ticket. Revisa los logs.' });
            }
            res.json({ success: true, message: `Ticket #${ticketNumber} enviado a impresión` });
        });

    } catch (error) {
        logger.error('Error processing manual ticket:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- IMPRIMIR TICKET A TERCERO (Empleado ausente) ---
router.post('/print-tercero', async (req, res) => {
    const { employeeId, printedByUserId } = req.body;

    if (!employeeId || !printedByUserId) {
        return res.status(400).json({ error: 'Faltan datos requeridos (employeeId, printedByUserId)' });
    }

    try {
        // 1. Verificar que el operador está autorizado
        const operatorRows = await db.query(
            'SELECT nombre_real, permisos FROM usuarios_impresion_manual WHERE id = ? AND activo = 1',
            [printedByUserId]
        );
        if (operatorRows.length === 0) {
            return res.status(403).json({ error: 'Usuario no autorizado o inactivo' });
        }
        if (!tienePermiso(operatorRows[0].permisos, 'tercero')) {
            return res.status(403).json({ error: 'No tienes permiso para imprimir tickets a terceros' });
        }
        const nombreOperador = operatorRows[0].nombre_real;

        // 2. Verificar que el empleado existe
        const empRows = await db.query(
            'SELECT zk_id, nombre_completo, tipo_menu_predeterminado FROM usuarios WHERE zk_id = ?',
            [employeeId]
        );
        if (empRows.length === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado con ese ID' });
        }
        const empleado = empRows[0];
        const nombreEmpleado = empleado.nombre_completo;

        // --- VERIFICACIÓN DE HORARIO ---
        try {
            const configRows = await db.query("SELECT clave, valor FROM configuracion");
            const config = {};
            configRows.forEach(c => config[c.clave] = c.valor);

            if (config['horario_activo'] === 'true') {
                const now = new Date();
                const currentTime = now.toTimeString().slice(0, 5);
                const start = config['horario_inicio'] || '00:00';
                const end = config['horario_fin'] || '23:59';

                if (currentTime < start || currentTime > end) {
                    return res.status(403).json({
                        error: `Fuera de horario de servicio (${start} - ${end})`
                    });
                }
            }
        } catch (err) {
            logger.error("Error checking schedule config for tercero", err);
        }

        // 3. Fecha y cálculos
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const fechaStr = `${year}-${month}-${day}`;
        const horaStr = today.toTimeString().split(' ')[0];

        // 4. Verificar si ya comió hoy (duplicado)
        const dupRows = await db.query(
            `SELECT COUNT(*) as conteo FROM registros 
             WHERE user_id = ? AND fecha = ? 
             AND descripcion IN ('TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET TERCERO')`,
            [employeeId, fechaStr]
        );
        if (dupRows[0].conteo > 0) {
            return res.status(409).json({ error: `${nombreEmpleado} ya tiene ticket registrado hoy` });
        }

        // 5. Determinar tipo de ticket (misma lógica que el biométrico)
        // IDs especiales (Gerencia)
        const IDS_CON_ESPECIAL = ['16', '119', '120'];
        let tipoTicket = 'TICKET TERCERO';

        if (IDS_CON_ESPECIAL.includes(String(employeeId))) {
            tipoTicket = 'TICKET GERENCIA';
        } else {
            // Verificar si tiene dieta seleccionada hoy o por defecto
            const menuRows = await db.query(
                'SELECT opcion FROM menu_diario WHERE user_id = ? AND fecha = ?',
                [employeeId, fechaStr]
            );
            if (menuRows.length > 0 && menuRows[0].opcion === 2) {
                tipoTicket = 'TICKET DIETA';
            } else if (menuRows.length === 0 && empleado.tipo_menu_predeterminado === 'Dieta') {
                tipoTicket = 'TICKET DIETA';
            } else {
                tipoTicket = 'TICKET ALMUERZO';
            }
        }

        // 6. Calcular número de ticket
        const usedRows = await db.query(
            `SELECT numero_ticket FROM registros 
             WHERE fecha = ? 
             AND descripcion IN ('TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA', 'TICKET TERCERO') 
             ORDER BY numero_ticket ASC`,
            [fechaStr]
        );
        const usedNumbers = usedRows.map(r => r.numero_ticket);
        let ticketNumber = 1;
        for (const n of usedNumbers) {
            if (n === ticketNumber) ticketNumber++;
            else if (n > ticketNumber) break;
        }

        // 7. Insertar en registros (como ticket normal del empleado)
        await db.query(
            'INSERT INTO registros (user_id, nombre, fecha, hora, descripcion, numero_ticket) VALUES (?, ?, ?, ?, ?, ?)',
            [employeeId, nombreEmpleado, fechaStr, horaStr, tipoTicket, ticketNumber]
        );

        // 8. Registrar auditoría de quién lo imprimió
        await db.query(
            'INSERT INTO log_tickets_manuales (nombre_visitante, impreso_por_usuario_id) VALUES (?, ?)',
            [`[TERCERO] ${nombreEmpleado} (ID:${employeeId})`, printedByUserId]
        );

        // 9. Ejecutar script Python de impresión (como ticket normal)
        const pythonScript = path.resolve(__dirname, '../python_core/reprint_ticket.py');
        const venvPython = path.resolve(__dirname, '../python_core/venv/bin/python');

        const es_dieta = tipoTicket === 'TICKET DIETA';
        const es_gerencia = tipoTicket === 'TICKET GERENCIA';
        const printType = es_gerencia ? 'TICKET GERENCIA' : (es_dieta ? 'TICKET DIETA' : 'TICKET ALMUERZO');

        const args = [
            '--name', `"${nombreEmpleado}"`,
            '--date', `"${fechaStr}"`,
            '--time', `"${horaStr}"`,
            '--type', `"${printType}"`,
            '--ticket_number', ticketNumber
        ].join(' ');

        const command = `"${venvPython}" "${pythonScript}" ${args}`;
        logger.info(`Printing tercero ticket #${ticketNumber} for ${nombreEmpleado} by ${nombreOperador}: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                logger.error(`Print Error (tercero): ${error.message}`, { stderr });
                return res.status(500).json({ error: 'Error imprimiendo ticket. Revisa los logs.' });
            }
            res.json({
                success: true,
                message: `Ticket #${ticketNumber} (${tipoTicket}) para ${nombreEmpleado} enviado a impresión`,
                ticketNumber,
                tipoTicket,
                impresoPor: nombreOperador
            });
        });

    } catch (error) {
        logger.error('Error processing tercero ticket:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
