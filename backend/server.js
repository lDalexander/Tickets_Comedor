
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const dashboardRoutes = require('./routes/dashboardRoutes');
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno desde .env
dotenv.config();

const app = express();
const server = require('http').createServer(app);

const PORT = process.env.PORT || 5000;

// --- CONFIGURACIÓN DE LOGS ---
// Asegurar que exista la carpeta de logs
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// --- CONFIGURACIÓN DE SOCKET.IO (TIEMPO REAL) ---
// Permite la comunicación bidireccional para el "Live Terminal" del Dashboard
const io = require('socket.io')(server, {
    cors: {
        origin: "*", // Permitir acceso desde cualquier origen en red local
        methods: ["GET", "POST"]
    }
});

// --- MIDDLEWARES ---
// CORS: Permite peticiones desde otros dominios/puertos
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// JSON Parser: Permite recibir datos en formato JSON en requests POST/PUT
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Logger de Peticiones: Registra cada entrada al servidor
app.use((req, res, next) => {
    logger.info(`Incoming request: ${req.method} ${req.url}`);
    next();
});

// --- RUTAS (ENDPOINTS) ---
app.use('/api/admin', require('./routes/adminRoutes')); // Rutas protegidas del Panel Admin
app.use('/api/manual-tickets', require('./routes/manualTicketRoutes')); // Módulo de Tickets Manuales
app.use('/api/config', require('./routes/configRoutes')); // Configuración del Sistema
app.use('/api', dashboardRoutes); // Rutas públicas del Dashboard

// Base de Datos (MySql)
const db = require('./db');

// --- RUTAS DE SELECCIÓN DE MENÚ (DIETA/NORMAL) ---

// Obtener información de usuario por ID (ZK ID)
app.get('/api/users/:id', async (req, res) => {
    try {
        const rows = await db.query('SELECT nombre_completo, role, tipo_menu_predeterminado FROM usuarios WHERE zk_id = ?', [req.params.id]);
        if (rows.length > 0) {
            res.json({
                success: true,
                name: rows[0].nombre_completo,
                role: rows[0].role || 'Operativo',
                defaultMenuType: rows[0].tipo_menu_predeterminado || 'Normal'
            });
        } else {
            res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (error) {
        logger.error('Error fetching user:', error);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Actualizar preferencias de usuario (Rol y Menú por defecto)
app.put('/api/users/:id/preferences', async (req, res) => {
    const { role, defaultMenuType } = req.body;
    try {
        await db.query('UPDATE usuarios SET role = ?, tipo_menu_predeterminado = ? WHERE zk_id = ?',
            [role, defaultMenuType, req.params.id]
        );

        // Notificar al Dashboard en tiempo real
        io.emit('new_log', {
            type: 'WEB',
            message: `Preferencias actualizadas (ID: ${req.params.id}) -> Rol: ${role}, Menú: ${defaultMenuType}`,
            status: 'success'
        });

        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating preferences:', error);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Busqueda de usuarios para autocompletado
app.get('/api/search/users', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        const query = `
            SELECT zk_id, nombre_completo 
            FROM usuarios 
            WHERE nombre_completo LIKE ? OR zk_id LIKE ? 
            LIMIT 10
        `;
        const wild = `%${q}%`;
        const rows = await db.query(query, [wild, wild]);
        res.json(rows);
    } catch (error) {
        logger.error('Error searching users:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Obtener menú semanal seleccionado por un usuario
app.get('/api/menu/:userId', async (req, res) => {
    try {
        // YEARWEEK verifica que sea de la semana actual
        const rows = await db.query(
            'SELECT * FROM menu_diario WHERE user_id = ? AND YEARWEEK(fecha, 1) = YEARWEEK(CURDATE(), 1)',
            [req.params.userId]
        );
        res.json(rows);
    } catch (error) {
        logger.error('Error fetching menu:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Guardar selección de menú
app.post('/api/menu', async (req, res) => {
    const { userId, selections } = req.body;
    if (!userId || !selections) return res.status(400).json({ error: 'Missing data' });

    let connection;
    try {
        connection = await db.pool.promise().getConnection();
        await connection.beginTransaction();
        for (const item of selections) {
            // Verificar si ya existe selección para ese día
            const [exists] = await connection.query(
                'SELECT id FROM menu_diario WHERE user_id = ? AND fecha = ?',
                [userId, item.date]
            );
            if (exists.length > 0) {
                await connection.query('UPDATE menu_diario SET opcion = ? WHERE id = ?', [item.option, exists[0].id]);
            } else {
                if (item.option) {
                    await connection.query('INSERT INTO menu_diario (user_id, fecha, opcion) VALUES (?, ?, ?)', [userId, item.date, item.option]);
                }
            }
        }
        await connection.commit();

        io.emit('new_log', {
            type: 'WEB',
            message: `Menú actualizado para usuario ID: ${userId}`,
            status: 'success'
        });

        res.json({ success: true });
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error('Error saving menu:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (connection) connection.release();
    }
});

// --- ENDPOINT: OBTENER LOGS DEL DÍA (Persistencia Terminal) ---
app.get('/api/logs/today', async (req, res) => {
    try {
        const rows = await db.query(
            "SELECT nombre, descripcion, hora, id FROM registros WHERE fecha = CURDATE() ORDER BY id ASC"
        );

        const logs = rows.map(r => {
            const isDuplicate = r.descripcion === 'Intento de Duplicado';
            const type = isDuplicate ? 'ALERTA' : 'TICKET';
            const status = isDuplicate ? 'error' : 'success';
            return {
                id: r.id,
                timestamp: r.hora, // Ya viene como string HH:MM:SS
                type: type,
                message: `${r.nombre} - ${r.descripcion}`,
                status: status
            };
        });

        res.json(logs);
    } catch (error) {
        logger.error('Error fetching daily logs:', error);
        res.status(500).json([]);
    }
});

// --- POLLING DE EVENTOS EN TIEMPO REAL ---
// El backend consulta la BD cada 2 segundos para ver si Python insertó nuevos registros
// y los envía via Socket.IO al Frontend.

let lastProcessedId = 0;

async function checkNewRecords() {
    try {
        if (lastProcessedId === 0) {
            // Primera ejecución: obtener el último ID actual para no repetir históricos
            const rows = await db.query("SELECT MAX(id) as maxId FROM registros");
            lastProcessedId = rows[0].maxId || 0;
            return;
        }

        const newRecords = await db.query(
            "SELECT * FROM registros WHERE id > ? ORDER BY id ASC",
            [lastProcessedId]
        );

        if (newRecords.length > 0) {
            newRecords.forEach(record => {
                const isDuplicate = record.descripcion === 'Intento de Duplicado';
                const status = isDuplicate ? 'error' : 'success';
                const type = isDuplicate ? 'ALERTA' : 'TICKET';

                // Emitir evento al frontend
                io.emit('new_log', {
                    type: type,
                    message: `${record.nombre} - ${record.descripcion}`,
                    status: status
                });
                lastProcessedId = record.id;
            });
            logger.info(`Emitted ${newRecords.length} new realtime events`);
        }
    } catch (error) {
        logger.error("Error polling for new records", error);
    }
}

// Ejecutar polling cada 2000ms (2 segundos)
setInterval(checkNewRecords, 2000);

// --- MANEJO DE ERRORES GLOBAL ---
app.use((err, req, res, next) => {
    logger.error('Unhandled Error', err);
    res.status(500).json({ error: 'Something went wrong!' });
});

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    console.log(`Server running on port ${PORT}`);
});

// Hack para mantener proceso vivo si algo falla (Prevent crash loop)
setInterval(() => { }, 1000);

// Debugging: Log why the process is exiting
process.on('exit', (code) => {
    logger.info(`Process exiting with code: ${code}`);
    console.log(`Process exiting with code: ${code}`);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('Unhandled Rejection:', reason);
});
