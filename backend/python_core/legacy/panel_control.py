import tkinter as tk
from tkinter import messagebox
import socket
import subprocess
import time
import threading
import os
import sys

import platform

# --- CONFIGURACIÓN ---
NOMBRE_APP = "SISTEMA COMEDOR - DETCUADOR"
SCRIPT_COMEDOR = "comedor.py"

if platform.system() == "Windows":
    RUTA_BAT = "run_comedor.bat"
    CMD_INIT = f'start cmd /k "{RUTA_BAT}"'
    MATAR_CMD = 'taskkill /FI "WINDOWTITLE eq SISTEMA COMEDOR - DETCUADOR" /F'
else:
    # Linux/Mac
    RUTA_BAT = "./run_comedor.sh" # We will create this or use python directly
    # Using python directly for Linux in a simple way or relying on a script
    # For now let's assume we want to run the python worker.
    # But start_system.sh does it all. 
    # Let's make this run comedor.py directly in a new terminal if possible, or just background.
    # Simpler: Just run the python script.
    CMD_INIT = f"python3 {SCRIPT_COMEDOR} &" 
    MATAR_CMD = "pkill -f comedor.py" 

HOST_MYSQL = "localhost"
PUERTO_MYSQL = 3306

class PanelControlApp:
    def __init__(self, root):
        self.root = root
        self.root.title(NOMBRE_APP)
        self.root.geometry("400x350")
        self.root.resizable(False, False)
        self.root.configure(bg="#2b2b2b")

        # Variables de estado
        self.proceso_comedor = None
        self.mysql_online = False

        # --- INTERFAZ ---
        # Título
        tk.Label(root, text="PANEL DE CONTROL", font=("Arial", 16, "bold"), 
                 bg="#2b2b2b", fg="white").pack(pady=20)
        
        # Estado MySQL
        self.lbl_mysql = tk.Label(root, text="Verificando MySQL...", font=("Arial", 10), 
                                  bg="#2b2b2b", fg="gray")
        self.lbl_mysql.pack(pady=5)

        # Estado Sistema
        self.lbl_estado = tk.Label(root, text="SISTEMA DETENIDO", font=("Arial", 12, "bold"), 
                                   bg="#2b2b2b", fg="#ff5555") # Rojo
        self.lbl_estado.pack(pady=20)

        # Botones
        self.btn_iniciar = tk.Button(root, text="▶ INICIAR SISTEMA", font=("Arial", 12, "bold"),
                                     bg="#4CAF50", fg="white", width=20, height=2,
                                     command=self.iniciar_sistema, state="disabled")
        self.btn_iniciar.pack(pady=10)

        self.btn_detener = tk.Button(root, text="⏹ DETENER", font=("Arial", 10, "bold"),
                                     bg="#f44336", fg="white", width=15,
                                     command=self.detener_sistema, state="disabled")
        self.btn_detener.pack(pady=5)
        
        # Footer
        tk.Label(root, text="Dpto. Sistemas 2026", bg="#2b2b2b", fg="#666").pack(side="bottom", pady=10)

        # Iniciar monitoreo en segundo plano
        self.hilo_monitoreo = threading.Thread(target=self.monitorear_servicios, daemon=True)
        self.hilo_monitoreo.start()

    def check_mysql(self):
        """Intenta conectar al puerto 3306 para ver si MySQL vive"""
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        try:
            result = sock.connect_ex((HOST_MYSQL, PUERTO_MYSQL))
            sock.close()
            return result == 0
        except:
            return False

    def monitorear_servicios(self):
        """Revisa constantemente el estado de MySQL"""
        while True:
            self.mysql_online = self.check_mysql()
            
            # Actualizar GUI (debe hacerse en el hilo principal con after, pero esto funciona simple)
            if self.mysql_online:
                self.lbl_mysql.config(text="✅ MySQL: ONLINE (Puerto 3306)", fg="#00ff00")
                if self.proceso_comedor is None:
                    self.btn_iniciar.config(state="normal", bg="#4CAF50")
            else:
                self.lbl_mysql.config(text="❌ MySQL: OFFLINE (Inicia XAMPP primero)", fg="#ff5555")
                self.btn_iniciar.config(state="disabled", bg="#555")
                
                # Si MySQL se cae y el sistema estaba corriendo, avisar
                if self.proceso_comedor:
                    self.lbl_estado.config(text="⚠ ERROR: BASE DE DATOS PERDIDA", fg="orange")

            time.sleep(2)

    def iniciar_sistema(self):
        if not self.mysql_online:
            messagebox.showerror("Error", "No se detecta MySQL. Por favor inicia XAMPP primero.")
            return

        try:
            if platform.system() == "Windows":
                self.proceso_comedor = subprocess.Popen(CMD_INIT, shell=True)
            else:
                # Linux: Run in background
                self.proceso_comedor = subprocess.Popen(CMD_INIT, shell=True)
            
            self.lbl_estado.config(text="🟢 SISTEMA CORRIENDO", fg="#00ff00")
            self.btn_iniciar.config(state="disabled", bg="#555")
            self.btn_detener.config(state="normal", bg="#f44336")
            
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo iniciar: {e}")

    def detener_sistema(self):
        respuesta = messagebox.askyesno("Detener", "Esto detendrá el proceso. ¿Confirmar?")
        if respuesta:
            os.system(MATAR_CMD)
            
            self.proceso_comedor = None
            self.lbl_estado.config(text="SISTEMA DETENIDO", fg="#ff5555")
            self.btn_iniciar.config(state="normal", bg="#4CAF50")
            self.btn_detener.config(state="disabled", bg="#555")

if __name__ == "__main__":
    root = tk.Tk()
    app = PanelControlApp(root)
    root.mainloop()