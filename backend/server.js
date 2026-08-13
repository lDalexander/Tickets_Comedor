
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const logger = require('./utils/logger');
const dashboardRoutes = require('./routes/dashboardRoutes');
const fs = require('fs');
const path = require('path');

// Path to the built frontend
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

// Cargar variables de entorno desde .env
dotenv.config();

const app = express();
const server = require('http').createServer(app);

const PORT = process.env.PORT || 5002;
// En producción Nginx es la entrada pública; Express solo escucha en localhost
const BIND_HOST = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
// Confiar en el primer proxy (Nginx) para que req.ip refleje la IP real del cliente
app.set('trust proxy', 1);

// Orígenes permitidos por CORS — configurar en /etc/comedor/secrets.env
// Ejemplo: CORS_ORIGINS=http://150.36.200.252:5173,http://150.36.200.252:3000
const ORIGENES_PERMITIDOS = [
    ...(process.env.CORS_ORIGINS || '').split(','),
    ...(process.env.CORS_EXTRA_ORIGINS || '').split(','),
].map(o => o.trim()).filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Sin origin: Postman, curl, mismo servidor (proxy interno) → permitir
        if (!origin || ORIGENES_PERMITIDOS.includes(origin)) {
            callback(null, true);
        } else {
            logger.warn(`CORS bloqueado: origen no permitido — ${origin}`);
            callback(new Error('Origen no permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

// --- CONFIGURACIÓN DE LOGS ---
// Asegurar que exista la carpeta de logs
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// --- CONFIGURACIÓN DE SOCKET.IO (TIEMPO REAL) ---
const io = require('socket.io')(server, {
    cors: {
        origin: corsOptions.origin,
        methods: ['GET', 'POST'],
    }
});

// --- MIDDLEWARES ---
app.use(cors(corsOptions));

// JSON Parser: Permite recibir datos en formato JSON en requests POST/PUT
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'online', timestamp: new Date() });
});

// Logger de Peticiones: Registra cada entrada al servidor
app.use((req, res, next) => {
    logger.info(`Incoming request: ${req.method} ${req.url}`);
    next();
});

// --- RATE LIMITING ---
// Ventana corta (1 min): el turno de almuerzo dura 30 min, un bloqueo largo
// dejaría al personal sin poder imprimir su ticket.
// Solo cuenta intentos FALLIDOS y se lleva por (IP + usuario), de modo que
// alguien equivocando su contraseña no bloquea al resto de las terminales.
const limitadorLogin = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const usuario = String(req.body?.username || '').trim().toLowerCase();
        return `${ipKeyGenerator(req.ip)}:${usuario}`;
    },
    message: { error: 'Demasiados intentos fallidos. Espere 1 minuto.' },
    standardHeaders: true,
    legacyHeaders: false
});

const limitadorTickets = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Demasiadas solicitudes de tickets.' },
    standardHeaders: true,
    legacyHeaders: false
});

const limitadorGeneral = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { error: 'Límite de requests alcanzado. Intenta en un momento.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/admin/login', limitadorLogin);
app.use('/api/manual-tickets/login', limitadorLogin);
app.use('/api/manual-tickets', limitadorTickets);
app.use('/api', limitadorGeneral);

// --- RUTAS (ENDPOINTS) ---
app.use('/api/admin', require('./routes/adminRoutes')); // Rutas protegidas del Panel Admin
app.use('/api/manual-tickets', require('./routes/manualTicketRoutes')); // Módulo de Tickets Manuales
app.use('/api/config', require('./routes/configRoutes')); // Configuración del Sistema
app.use('/api/almuerzos', require('./routes/almuerzoRoutes')); // Control de tiempo de almuerzo
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

// Polling solo cuando el proceso arranca directamente (no en tests)
if (require.main === module) {
    setInterval(checkNewRecords, 2000);
}

// --- SERVIR FRONTEND ESTÁTICO (Producción) ---
// Servir los archivos compilados de React/Vite
if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    // SPA catch-all: cualquier ruta no-API devuelve index.html para React Router
    app.get('{*path}', (req, res) => {
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
    logger.info(`Serving frontend from ${FRONTEND_DIST}`);
} else {
    logger.warn('Frontend dist not found. Run "npm run build" in /frontend.');
}

// --- MANEJO DE ERRORES GLOBAL ---
app.use((err, req, res, next) => {
    logger.error('Unhandled Error', err);
    res.status(500).json({ error: 'Something went wrong!' });
});

if (require.main === module) {
    server.listen(PORT, BIND_HOST, () => {
        logger.info(`Server running on ${BIND_HOST}:${PORT}`);
        console.log(`Server running on ${BIND_HOST}:${PORT}`);
    });
}

module.exports = { app, server, io };

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
