const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const dashboardRoutes = require('./routes/dashboardRoutes');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)){
    fs.mkdirSync(logsDir);
}

const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
app.use(express.json());

app.use((req, res, next) => {
    logger.info(`Incoming request: ${req.method} ${req.url}`);
    next();
});

app.use('/api', dashboardRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    logger.error('Unhandled Error', err);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    console.log(`Server running on port ${PORT}`);
});

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
