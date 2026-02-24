
import sys
import time
import logging
import threading
import subprocess
from datetime import datetime
from zk import ZK
from dotenv import load_dotenv
import os

# Importar módulos propios
from src.database import Database
from src.printer import TicketPrinter

# Cargar variables de entorno
load_dotenv()

# Configuración de Logging
logging.basicConfig(
    filename='comedor.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Configuración ZK
IP_BIOMETRICO = os.getenv('IP_BIOMETRICO', '150.36.200.12')
PUERTO_ZK = int(os.getenv('PUERTO_ZK', 4370))

def tarea_monitoreo(printer, db):
    """
    Hilo secundario que verifica el estado de la impresora y sincroniza usuarios
    cada 12 horas.
    """
    logging.info("Hilo de monitoreo iniciado.")
    # Ejecutar primera vez
    printer.verificar_estado()
    db.sincronizar_usuarios_faltantes()
    
    while True:
        # Esperar 12 horas (43200 segundos)
        time.sleep(43200)
        timestamp = datetime.now().strftime('%d/%m %H:%M')
        print(f"\n[{timestamp}] ⏰ Revisión programada de 12h...")
        printer.verificar_estado()
        db.sincronizar_usuarios_faltantes()

def main():
    print("--- SISTEMA AUDITOR DE COMEDOR 24/7 ---")
    logging.info("Sistema iniciado (Versión Refactorizada).")
    
    # Inicializar módulos
    db = Database()
    printer = TicketPrinter()
    
    # Variables de estado
    ultimo_dia = datetime.now().day

    # Iniciar hilo de monitoreo
    hilo = threading.Thread(target=tarea_monitoreo, args=(printer, db), daemon=True)
    hilo.start()

    # Diccionario para controlar rebotes (Debounce)
    last_scan_time = {}

    def process_biometric_event(event, conn, user_map_zk) -> None:
        if event is None or event.user_id is None: return

        # Verificar estado impresora antes de procesar
        estado_imp = printer.verificar_estado()

        # Identificar usuario
        user_id_str = str(event.user_id)
        nombre_zk = user_map_zk.get(user_id_str, "Desconocido")
        
        # --- DEBOUNCE LOGIC (Evitar doble marcación) ---
        current_time = time.time()
        es_vip = user_id_str in db.IDS_VIPS
        
        # Limpieza de mem leak: Remover tiempos de escaneo antiguos (> 10 seg)
        keys_to_delete = [k for k, t in last_scan_time.items() if current_time - t > 10]
        for k in keys_to_delete:
            del last_scan_time[k]

        if not es_vip:
            if user_id_str in last_scan_time and (current_time - last_scan_time[user_id_str] < 5):
                print(f"⏳ Ignorando rebote (doble scan) para {nombre_zk}")
                return
            last_scan_time[user_id_str] = current_time
        else:
            print(f"🌟 VIP detectado ({nombre_zk}): Omitiendo filtro anti-rebote.")

        # --- VERIFICACIÓN DE HORARIO ---
        permitido, msg_horario = db.verificar_horario()
        if not permitido:
            print(f"⛔ {msg_horario} - Acceso denegado para {nombre_zk}")
            return
        
        if nombre_zk == "Desconocido":
            # Intentar re-sincronizar si es desconocido
            users_zk = conn.get_users()
            user_map_zk.update(db.sincronizar_usuarios_masivo(users_zk))
            nombre_zk = user_map_zk.get(user_id_str, "Desconocido")
        
        # Obtener nombre real de BD
        nombre_completo = db.obtener_nombre_real(event.user_id, nombre_zk)
        print(f"\n--> Asistencia: {nombre_completo}")
        
        # Registrar evento en BD
        resultado, ticket_number = db.registrar_evento(event.user_id, nombre_completo)

        # Manejo de Errores Críticos (BD caída)
        if resultado == "ERROR":
            msg_error = "❌ Error Crítico en Registro: Iniciando Protocolo de Mantenimiento..."
            print(msg_error)
            logging.error("Iniciando Mantenimiento Automático por fallo en DB.")
            printer.imprimir_ticket_mantenimiento()
            printer.enviar_correo("🚨 FALLO CRÍTICO - SISTEMA COMEDOR", "Fallo al registrar evento en BD.")
            return

        # Imprimir Ticket si la impresora está lista
        if estado_imp in ["OFFLINE", "SIN_PAPEL", "TAPA_ABIERTA", "ERROR_MECANICO"]:
            err = f"❌ OMITIENDO IMPRESIÓN: {estado_imp}"
            print(err)
            logging.error(err)
        else:
            if SearchResultInPrintCondition(resultado):
                es_dieta, es_especial, sin_sopa, sin_arroz = db.obtener_preferencias_menu(event.user_id)
                if resultado == "TICKET DIETA": es_dieta = True
                if resultado == "TICKET GERENCIA": es_especial = True

                printer.imprimir_ticket_valido(
                    nombre_completo, 
                    event.user_id, 
                    ticket_number,
                    es_dieta=es_dieta,
                    es_especial=es_especial,
                    sin_sopa=sin_sopa,
                    sin_arroz=sin_arroz
                )

            elif resultado == "TICKET EXTRA":
                printer.imprimir_ticket_extra(nombre_completo, ticket_number)
            
            elif resultado == "INTENTO DE DUPLICADO":
                print(f"🚫 Intento de duplicado para {nombre_completo} (Sin impresión)")

        sys.stdout.flush()

    def SearchResultInPrintCondition(resultado):
         return resultado in ["TICKET ALMUERZO", "TICKET DIETA", "TICKET GERENCIA"]

    while True:
        zk = ZK(IP_BIOMETRICO, port=PUERTO_ZK, timeout=60)
        conn = None
        try:
            print(f"\n🔄 Conectando a Biométrico {IP_BIOMETRICO}...")
            conn = zk.connect()
            print(".: CONECTADO :.")
            
            # Sincronizar usuarios al conectar
            users_zk = conn.get_users()
            user_map_zk = db.sincronizar_usuarios_masivo(users_zk)
            
            print(".: ESPERANDO HUELLAS :.")
            
            # El timeout en live_capture asegura que el yield devuelva el control (y no se quede bloqueado)
            # si no hay huellas, permitiendo checkear si el día cambió o hay error de socket.
            for event in conn.live_capture(new_timeout=120):
                hoy = datetime.now()
                if hoy.day != ultimo_dia:
                    ultimo_dia = hoy.day
                    logging.info("Cambio de día: Variables reiniciadas y forzando reconexión.")
                    print("Reconectando por cambio de día (limpieza de socket TCP)...")
                    break # Forzar que se desconecte y vuelva a iterar el while True
                    
                if event is not None:
                    try:
                        process_biometric_event(event, conn, user_map_zk)
                    except Exception as ev_err:
                        logging.error(f"Error procesando evento: {ev_err}")

        except KeyboardInterrupt:
            print("\n Apagando...")
            logging.info("Sistema apagado por usuario.")
            break 
        except Exception as e:
            msg = f"Error conexión Biométrico: {e}"
            print(f"\n⚠️ {msg}")
            logging.error(msg)
            # Esperar antes de reintentar para no saturar CPU
            time.sleep(5)
        finally:
            if conn:
                try: conn.disconnect()
                except: pass

if __name__ == "__main__":
    main()
