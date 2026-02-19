const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const dashboardRoutes = require('./routes/dashboardRoutes');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const server = require('http').createServer(app);

const PORT = process.env.PORT || 5000;

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];

const io = require('socket.io')(server, {
    cors: {
        origin: "*", // Allow all origins for local network access
        methods: ["GET", "POST"]
    }
});

app.use(cors({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

app.use((req, res, next) => {
    logger.info(`Incoming request: ${req.method} ${req.url}`);
    next();
});

app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api', dashboardRoutes);

// Database Polling for Real-Time Events
const db = require('./db');

// --- MEAL SELECTION ROUTES ---

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

app.put('/api/users/:id/preferences', async (req, res) => {
    const { role, defaultMenuType } = req.body;
    try {
        // Only update allowed fields
        await db.query('UPDATE usuarios SET role = ?, tipo_menu_predeterminado = ? WHERE zk_id = ?',
            [role, defaultMenuType, req.params.id]
        );

        // Emit log event for preference change
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

app.get('/api/search/users', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        // Search by ID or Name
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

app.get('/api/menu/:userId', async (req, res) => {
    try {
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

app.post('/api/menu', async (req, res) => {
    const { userId, selections } = req.body;
    if (!userId || !selections) return res.status(400).json({ error: 'Missing data' });

    let connection;
    try {
        connection = await db.pool.promise().getConnection();
        await connection.beginTransaction();
        for (const item of selections) {
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

        // Emit log event for menu change
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
let lastProcessedId = 0;

async function checkNewRecords() {
    try {
        if (lastProcessedId === 0) {
            // First run: get the max ID
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

// Poll every 2 seconds
setInterval(checkNewRecords, 2000);

// Global Error Handler
app.use((err, req, res, next) => {
    logger.error('Unhandled Error', err);
    res.status(500).json({ error: 'Something went wrong!' });
});

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    console.log(`Server running on port ${PORT}`);
});

// Keep process alive hack
setInterval(() => { }, 1000);

// Debugging: Log why the process is exiting
process.on('exit', (code) => {
    logger.info(`Process exiting with code: ${code}`);
    console.log(`Process exiting with code: ${code}`);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    console.error('Uncaught Exception:', err);
    // Keep it alive for now to see logs
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('Unhandled Rejection:', reason);
});
