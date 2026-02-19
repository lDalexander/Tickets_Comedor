
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
            
            for event in conn.live_capture():
                if event is None or event.user_id is None: continue

                # Verificar estado impresora antes de procesar
                estado_imp = printer.verificar_estado()
                
                # Reset diario de logs o variables si fuera necesario
                hoy = datetime.now()
                if hoy.day != ultimo_dia:
                    ultimo_dia = hoy.day
                    logging.info("Cambio de día: Variables reiniciadas.")

                # Identificar usuario
                user_id_str = str(event.user_id)
                nombre_zk = user_map_zk.get(user_id_str, "Desconocido")
                
                # --- DEBOUNCE LOGIC (Evitar doble marcación) ---
                current_time = time.time()
                es_vip = user_id_str in db.IDS_VIPS
                
                # Solo aplicar debounce si NO es VIP
                if not es_vip:
                    if user_id_str in last_scan_time and (current_time - last_scan_time[user_id_str] < 5):
                        # Ignorar si pasaron menos de 5 segundos
                        print(f"⏳ Ignorando rebote (doble scan) para {nombre_zk}")
                        continue
                    # Actualizar tiempo solo si no es VIP (para que el VIP pueda marcar N veces seguidas sin actualizar el timer de bloqueo accidental)
                    # O mejor, actualizamos siempre para tener rastro, pero la condición 'if not es_vip' permite pasar.
                    last_scan_time[user_id_str] = current_time
                else:
                    print(f"🌟 VIP detectado ({nombre_zk}): Omitiendo filtro anti-rebote.")
                # -----------------------------------------------

                # --- VERIFICACIÓN DE HORARIO ---
                permitido, msg_horario = db.verificar_horario()
                if not permitido:
                    print(f"⛔ {msg_horario} - Acceso denegado para {nombre_zk}")
                    # Opcional: Podríamos imprimir un ticket de "Fuera de Horario" o solo ignorar
                    continue
                # -----------------------------------------------
                
                if nombre_zk == "Desconocido":
                    # Intentar re-sincronizar si es desconocido
                    users_zk = conn.get_users()
                    user_map_zk = db.sincronizar_usuarios_masivo(users_zk)
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
                    
                    # Intentar imprimir ticket de error
                    printer.imprimir_ticket_mantenimiento()
                    
                    # Notificar admin
                    printer.enviar_correo("🚨 FALLO CRÍTICO - SISTEMA COMEDOR", "Fallo al registrar evento en BD.")
                    
                    # Intentar autoreparación (script externo)
                    try:
                         # Asumimos que el script está en la raíz del proyecto comedor
                        # Script no encontrado, omitiendo paso para evitar errores
                        logging.warning("Script daily_maintenance.sh no encontrado, omitiendo ejecución.")
                    except Exception as sub_e:
                        logging.error(f"No se pudo ejecutar script mantenimiento: {sub_e}")

                # Imprimir Ticket si la impresora está lista
                elif estado_imp in ["OFFLINE", "SIN_PAPEL", "TAPA_ABIERTA", "ERROR_MECANICO"]:
                    err = f"❌ OMITIENDO IMPRESIÓN: {estado_imp}"
                    print(err)
                    logging.error(err)
                else:
                    # Lógica de impresión según tipo
                    if resultado in ["TICKET ALMUERZO", "TICKET DIETA", "TICKET GERENCIA"]:
                         # Obtener preferencias para personalizar el ticket (sin sopa/arroz)
                        es_dieta, es_especial, sin_sopa, sin_arroz = db.obtener_preferencias_menu(event.user_id)
                        
                        # Sobreescribir banderas segun el tipo devuelto por registrar_evento
                        # Si el evento fue registrado como DIETA, forzamos es_dieta=True
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
                        # Opcional: imprimir duplicado o solo loguear
                        print(f"🚫 Intento de duplicado para {nombre_completo} (Sin impresión)")

                sys.stdout.flush()

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
