
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

def add_ticket_column():
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Check if column exists
        print("Checking for column...")
        cursor.execute("SHOW COLUMNS FROM registros LIKE 'numero_ticket'")
        result = cursor.fetchone()
        
        if not result:
            print("Adding numero_ticket column...")
            cursor.execute("ALTER TABLE registros ADD COLUMN numero_ticket INT DEFAULT 0")
            conn.commit()
            print("Column added successfully.")
        else:
            print("Column numero_ticket already exists.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    add_ticket_column()
