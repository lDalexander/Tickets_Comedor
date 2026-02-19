
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: '/home/john/comedor/Tickets_Comedor/backend/.env' });

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_comedor'
};

const check = async () => {
    let connection;
    try {
        connection = await mysql.createConnection(config);
        const [rows] = await connection.query('SELECT password_hash FROM usuarios_impresion_manual WHERE username = "ksuarez"');
        if (rows.length > 0) {
            console.log("Current Hash:", rows[0].password_hash);
        } else {
            console.log("User not found");
        }
    } catch (error) {
        console.error(error);
    } finally {
        if (connection) await connection.end();
    }
};

check();
