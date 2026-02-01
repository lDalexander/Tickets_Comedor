const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function checkTables() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database:', process.env.DB_NAME);

        const [tables] = await connection.execute('SHOW TABLES');
        const fs = require('fs');
        let output = '';

        // const [tables] = await connection.execute('SHOW TABLES'); // Removed duplicate
        output += '--- TABLES FOUND ---\n';
        output += JSON.stringify(tables, null, 2) + '\n';

        for (const tableRow of tables) {
            const tableName = Object.values(tableRow)[0];
            output += `\n--- COLUMNS IN ${tableName} ---\n`;
            const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
            output += columns.map(c => `${c.Field} (${c.Type})`).join(', ') + '\n';
        }

        fs.writeFileSync('tables_output.txt', output);
        console.log('Schema written to tables_output.txt');

        await connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkTables();
