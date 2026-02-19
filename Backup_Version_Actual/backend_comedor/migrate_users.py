
import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'host': os.getenv('DB_HOST', 'localhost'),
    'database': os.getenv('DB_NAME', 'control_comedor'),
    'port': int(os.getenv('DB_PORT', 3306))
}

IDS_CON_DIETA = ['110','90','12','91','83','2','112','72','96','11','38','79','81','48','7','140','111','80','143','71','64','66','67','73','13','52','91','92','81','98','97','107']

def migrate_users():
    conn = None

    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # 1. Add 'role' column
        print("Checking/Adding 'role' column...")
        cursor.execute("SHOW COLUMNS FROM usuarios LIKE 'role'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE usuarios ADD COLUMN role VARCHAR(50) DEFAULT 'Operativo'")
            print("Added 'role' column.")
        else:
            print("'role' column exists.")

        # 2. Add 'tipo_menu_predeterminado' column
        print("Checking/Adding 'tipo_menu_predeterminado' column...")
        cursor.execute("SHOW COLUMNS FROM usuarios LIKE 'tipo_menu_predeterminado'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE usuarios ADD COLUMN tipo_menu_predeterminado VARCHAR(50) DEFAULT 'Normal'")
            print("Added 'tipo_menu_predeterminado' column.")
        else:
            print("'tipo_menu_predeterminado' column exists.")

        conn.commit()

        # 3. Populate Diet IDs
        print(f"Migrating users to 'Dieta'...")
        updated_count = 0
        for uid in IDS_CON_DIETA:
            # Update user if exists
            sql = "UPDATE usuarios SET tipo_menu_predeterminado = 'Dieta' WHERE zk_id = %s"
            cursor.execute(sql, (uid,)) 
            # Note: rowcount might be 0 if already set, but that's fine.
            # Use 'INSERT IGNORE' or check existence if we wanted to be super precise about failures?
            # But UPDATE is safe. 
            # However, if the user doesn't exist in 'usuarios' table yet (maybe never synced?), 
            # this update does nothing. We assume these IDs exist.
            
            # The prompt says: "Importa la lista actual... marcándolos en la BD".
            # If they don't exist, maybe insert them?
            # Given the system syncs from ZK, they should exist if they are active employees.
            # If not, we can insert them with just the ID.
            
            if cursor.rowcount == 0:
                 # Check if user exists
                 cursor.execute("SELECT zk_id FROM usuarios WHERE zk_id = %s", (uid,))
                 if not cursor.fetchone():
                     print(f"User {uid} not found in DB. Inserting placeholder...")
                     cursor.execute("INSERT INTO usuarios (zk_id, nombre_completo, tipo_menu_predeterminado) VALUES (%s, %s, 'Dieta')", (uid, f"User_{uid}"))
                     updated_count += 1
            else:
                 updated_count += 1
            
        conn.commit()
        print(f"Migration complete. Updated {updated_count} users to have Diet default.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    migrate_users()
