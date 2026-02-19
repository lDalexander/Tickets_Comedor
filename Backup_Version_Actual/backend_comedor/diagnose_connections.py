
import os
import socket
import sys
from dotenv import load_dotenv
from zk import ZK

# Load environment variables
load_dotenv()

# Configuration
IP_BIOMETRICO = os.getenv('IP_BIOMETRICO', '150.36.200.12')
IP_IMPRESORA  = os.getenv('IP_IMPRESORA', '150.36.200.9')
PUERTO_ZK     = int(os.getenv('PUERTO_ZK', 4370))

def check_printer():
    print(f"\n--- Checking Printer at {IP_IMPRESORA}:9100 ---")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((IP_IMPRESORA, 9100))
        
        # Send status commands as in comedor.py
        s.send(b'\x10\x04\x02') 
        resp_error = s.recv(1)
        s.send(b'\x10\x04\x04') 
        resp_papel = s.recv(1)
        s.close()
        
        if not resp_error or not resp_papel:
            print("❌ Received empty response from printer.")
            return

        byte_error = ord(resp_error)
        byte_papel = ord(resp_papel)

        tapa_abierta  = (byte_error & 0x04) > 0
        error_general = (byte_error & 0x40) > 0
        sin_papel     = (byte_papel & 0x60) > 0
        poco_papel    = (byte_papel & 0x0C) > 0

        status_messages = []
        if tapa_abierta: status_messages.append("TAPA_ABIERTA")
        if error_general: status_messages.append("ERROR_MECANICO")
        if sin_papel: status_messages.append("SIN_PAPEL")
        if poco_papel: status_messages.append("POCO_PAPEL")

        if not status_messages:
            print("✅ Printer Status: OK")
        else:
            print(f"⚠️ Printer Issues Found: {', '.join(status_messages)}")
            
        print(f"   Raw Error Byte: {bin(byte_error)}")
        print(f"   Raw Paper Byte: {bin(byte_papel)}")

    except Exception as e:
        print(f"❌ Failed to connect to printer: {e}")

def check_biometric():
    print(f"\n--- Checking Biometric Device at {IP_BIOMETRICO}:{PUERTO_ZK} ---")
    zk = ZK(IP_BIOMETRICO, port=PUERTO_ZK, timeout=10)
    conn = None
    try:
        print("Connecting...")
        conn = zk.connect()
        print("✅ Connection Successful!")
        
        # Try to get some info to verify functionality
        users = conn.get_users()
        print(f"✅ Successfully retrived {len(users)} users from device.")
        
        # Optional: Check time or other params
        time = conn.get_time()
        print(f"✅ Device Time: {time}")

    except Exception as e:
        print(f"❌ Failed to connect to biometric device: {e}")
    finally:
        if conn:
            try:
                conn.disconnect()
            except:
                pass

if __name__ == "__main__":
    print("Starting Diagnostics...")
    check_printer()
    check_biometric()
    print("\nDiagnostics Complete.")
