
import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv("backend_comedor/.env")

DB_CONFIG = {
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'host': os.getenv('DB_HOST', 'localhost'),
    'database': os.getenv('DB_NAME', 'control_comedor'),
    'port': int(os.getenv('DB_PORT', 3306))
}

def check_arteaga():
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # 1. Check Registros
    cursor.execute("SELECT id, user_id, nombre FROM registros WHERE nombre LIKE '%ARTEAGA%' OR user_id='119'")
    registros = cursor.fetchall()
    print("--- REGISTROS (ARTEAGA/119) ---")
    for r in registros:
        print(r)
        
    # 2. Check Usuarios
    cursor.execute("SELECT zk_id, nombre_completo FROM usuarios WHERE zk_id='119' OR nombre_completo LIKE '%ARTEAGA%'")
    usuarios = cursor.fetchall()
    print("\n--- USUARIOS (ARTEAGA/119) ---")
    for u in usuarios:
        print(u)
        
    if not usuarios:
        print("\n[!] ARTEAGA NO ESTA EN USUARIOS")
    else:
        print("\n[OK] ARTEAGA SI ESTA EN USUARIOS")
        
    conn.close()

if __name__ == "__main__":
    check_arteaga()
