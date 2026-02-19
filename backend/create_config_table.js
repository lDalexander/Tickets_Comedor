
const db = require('./db');

async function migrate() {
    try {
        console.log("Creating 'configuracion' table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS configuracion (
                clave VARCHAR(50) PRIMARY KEY,
                valor TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log("Table created.");

        console.log("Inserting default values...");
        // Use INSERT IGNORE to avoid overwriting if exists
        await db.query(`
            INSERT IGNORE INTO configuracion (clave, valor) VALUES 
            ('horario_inicio', '11:45'),
            ('horario_fin', '14:00'),
            ('horario_activo', 'true')
        `);
        console.log("Defaults inserted.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
