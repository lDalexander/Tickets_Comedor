const mysql = require('mysql2');
const dotenv = require('dotenv');
const logger = require('./utils/logger');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
});

pool.on('error', (err) => {
  logger.error('Unexpected Database Error (Pool)', err);
});

const promisePool = pool.promise();

async function query(sql, params) {
  try {
    const [rows, fields] = await promisePool.execute(sql, params);
    return rows;
  } catch (error) {
    logger.error('Database Query Error', { sql, params, error });
    throw error;
  }
}

module.exports = { query, pool };
