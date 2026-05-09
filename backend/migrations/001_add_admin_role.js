require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../db');

async function migrate() {
    try {
        console.log('🔄 Verificando columna rol en usuarios_impresion_manual...');

        const cols = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'usuarios_impresion_manual'
             AND COLUMN_NAME = 'rol'`
        );

        if (cols.length > 0) {
            console.log('✅ Columna rol ya existe. Migración omitida.');
        } else {
            await db.query(`
                ALTER TABLE usuarios_impresion_manual
                ADD COLUMN rol VARCHAR(20) NOT NULL DEFAULT 'operador'
            `);
            console.log('✅ Columna rol agregada.');

            const upd = await db.query(
                "UPDATE usuarios_impresion_manual SET rol = 'admin' WHERE activo = 1"
            );
            console.log(`✅ ${upd.affectedRows} usuario(s) existente(s) promovidos a rol admin.`);
        }

        const users = await db.query(
            'SELECT id, username, nombre_real, activo, rol FROM usuarios_impresion_manual'
        );

        if (users.length > 0) {
            console.log('\nUsuarios registrados:');
            console.table(users);
        } else {
            console.log('\n⚠️  Sin usuarios en usuarios_impresion_manual.');
            console.log('Crea uno desde el Panel Admin > Operadores o directamente en BD.');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error en migración:', err.message);
        process.exit(1);
    }
}

migrate();
