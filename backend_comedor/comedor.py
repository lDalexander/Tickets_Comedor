import sys
import time
import textwrap
import socket
import smtplib
import logging
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from zk import ZK, const
import mysql.connector
from escpos.printer import Network

# ==========================================
#   CONFIGURACIÓN GLOBAL Y LOGS
# ==========================================
# Configuración única del LOG al inicio (Correcto)
logging.basicConfig(
    filename='comedor.log', 
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# --- CONFIGURACIÓN DE DISPOSITIVOS ---
IP_BIOMETRICO = '150.36.200.12'
IP_IMPRESORA  = '150.36.200.9'
PUERTO_ZK     = 4370
ARCHIVO_LOGO  = "logo_grande.png" 

# --- CONFIGURACIÓN DE CORREO (SMTP) ---
SMTP_SERVER   = 'smtp-mail.outlook.com'
SMTP_PORT     = 587
SMTP_USER     = 'no-reply@detcuador.com'
SMTP_PASS     = 'D3tcuador2025@'
EMAIL_DESTINO = 'agarcia@detcuador.com'

IDS_VIPS = ['14', '27', '33'] 
IDS_CON_DIETA = ['110','12','136','91','83','2','112','72','96','11','38','79','81','48','7','140','111','80','143','71','64','66','67','73','13','52']

DB_CONFIG = {
    'user': 'root',
    'password': '',
    'host': 'localhost',
    'database': 'control_comedor',
    'port': 3306
}

memoria_papel = {} 
estado_anterior_impresora = "DESCONOCIDO"

# ==========================================
#   FUNCIONES DE CORREO Y ESTADO
# ==========================================

def enviar_correo(asunto, mensaje):
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_USER
        msg['To'] = EMAIL_DESTINO
        msg['Subject'] = f"🤖 MONITOR IMP. DE TICKETS: {asunto}"
        msg.attach(MIMEText(mensaje, 'plain'))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, EMAIL_DESTINO, msg.as_string())
        server.quit()
        
        log_msg = f"📧 [EMAIL] Enviado: {asunto}"
        print(log_msg)
        logging.info(log_msg)

    except Exception as e:
        err_msg = f"❌ [EMAIL] Error enviando correo: {e}"
        print(err_msg)
        logging.error(err_msg)

def verificar_estado_impresora():
    global estado_anterior_impresora
    nuevo_estado = "OK"
    mensaje_error = ""
    asunto_error = ""
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((IP_IMPRESORA, 9100))
        
        s.send(b'\x10\x04\x02') 
        resp_error = s.recv(1)
        s.send(b'\x10\x04\x04') 
        resp_papel = s.recv(1)
        s.close()
        
        if not resp_error or not resp_papel:
            raise Exception("Respuesta vacía")

        byte_error = ord(resp_error)
        byte_papel = ord(resp_papel)

        tapa_abierta  = (byte_error & 0x04) > 0
        error_general = (byte_error & 0x40) > 0
        sin_papel     = (byte_papel & 0x60) > 0
        poco_papel    = (byte_papel & 0x0C) > 0

        if tapa_abierta:
            nuevo_estado = "TAPA_ABIERTA"
            asunto_error = "⚠️ ALERTA: TAPA ABIERTA"
            mensaje_error = "La tapa está abierta."
        elif sin_papel:
            nuevo_estado = "SIN_PAPEL"
            asunto_error = "⛔ ALERTA: SIN PAPEL"
            mensaje_error = "La impresora no tiene papel."
        elif error_general:
            nuevo_estado = "ERROR_MECANICO"
            asunto_error = "❌ ALERTA: FALLA MECANICA"
            mensaje_error = "Posible atasco."
        elif poco_papel:
            nuevo_estado = "POCO_PAPEL"
        else:
            nuevo_estado = "OK"

    except Exception as e:
        nuevo_estado = "OFFLINE"
        asunto_error = "🔌 ALERTA: IMPRESORA APAGADA/OFFLINE"
        mensaje_error = "No se detecta conexión."
        if estado_anterior_impresora != "OFFLINE":
             logging.error(f"Error conexión impresora: {e}")

    # Notificación de cambios de estado
    if nuevo_estado != estado_anterior_impresora:
        if nuevo_estado != "OK" and nuevo_estado != "POCO_PAPEL":
            msg = f"🚨 CAMBIO A ESTADO CRÍTICO: {nuevo_estado}"
            print(msg)
            logging.warning(msg)
            enviar_correo(asunto_error, mensaje_error)
        
        elif nuevo_estado == "OK" and estado_anterior_impresora not in ["OK", "DESCONOCIDO", "POCO_PAPEL"]:
            msg = "✅ IMPRESORA RECUPERADA."
            print(msg)
            logging.info(msg)
            enviar_correo("🟢 IMPRESORA ONLINE Y LISTA", "Sistema operativo.")

        estado_anterior_impresora = nuevo_estado
    
    return nuevo_estado

def tarea_monitoreo_periodico():
    print("⏰ Hilo de monitoreo periódico INICIADO (Cada 12h)")
    logging.info("Hilo de monitoreo iniciado.")
    while True:
        time.sleep(43200) 
        timestamp = datetime.now().strftime('%d/%m %H:%M')
        print(f"\n[{timestamp}] ⏰ Revisión programada de 12h...")
        verificar_estado_impresora()

# ==========================================
#   FUNCIONES BD / IMPRESION
# ==========================================

def obtener_nombre_real(user_id, nombre_zk_cortado):
    conn = None
    nombre_final = nombre_zk_cortado
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        sql = "SELECT nombre_completo FROM usuarios WHERE zk_id = %s"
        cursor.execute(sql, (user_id,))
        resultado = cursor.fetchone()
        
        if resultado:
            nombre_final = resultado[0]
        else:
            print(f"🆕 NUEVO EMPLEADO DETECTADO (ID {user_id}).")
            logging.info(f"Nuevo empleado guardado: ID {user_id}")
            sql_insert = "INSERT INTO usuarios (zk_id, nombre_completo) VALUES (%s, %s)"
            cursor.execute(sql_insert, (user_id, nombre_zk_cortado))
            conn.commit()
            nombre_final = nombre_zk_cortado

    except Exception as e:
        logging.error(f"Error sincronizando usuario: {e}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()
    return nombre_final

def registrar_evento(user_id, nombre):
    conn = None
    tipo_evento = "ERROR"
    es_vip = str(user_id) in IDS_VIPS

    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        ahora = datetime.now()
        fecha_hoy = ahora.date()

        query = "SELECT COUNT(*) FROM registros WHERE user_id = %s AND fecha = %s AND (descripcion = 'TICKET ALMUERZO' OR descripcion = 'TICKET EXTRA')"
        cursor.execute(query, (user_id, fecha_hoy))
        (conteo,) = cursor.fetchone()

        if conteo == 0:
            tipo_evento = "TICKET ALMUERZO"
        else:
            if es_vip:
                tipo_evento = "TICKET EXTRA"
            else:
                tipo_evento = "INTENTO DE DUPLICADO"

        sql_insert = "INSERT INTO registros (user_id, nombre, fecha, hora, descripcion) VALUES (%s, %s, %s, %s, %s)"
        val_insert = (user_id, nombre, fecha_hoy, ahora.time(), tipo_evento)
        cursor.execute(sql_insert, val_insert)
        conn.commit()
        
        log_msg = f"✅ [BD] REGISTRADO: {nombre} -> {tipo_evento}"
        print(log_msg)
        logging.info(log_msg)
        return tipo_evento

    except Exception as e:
        logging.error(f"Error BD al registrar: {e}")
        return "ERROR"
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

def sincronizar_usuarios_db(zk_conn):
    print("🔄 Sincronizando usuarios...")
    conn_db = None
    nuevos_agregados = 0
    try:
        users_device = zk_conn.get_users()
        conn_db = mysql.connector.connect(**DB_CONFIG)
        cursor = conn_db.cursor()
        cursor.execute("SELECT zk_id FROM usuarios")
        ids_en_bd = {str(row[0]) for row in cursor.fetchall()}
        
        for u in users_device:
            uid_str = str(u.user_id)
            if uid_str not in ids_en_bd:
                sql = "INSERT INTO usuarios (zk_id, nombre_completo) VALUES (%s, %s)"
                cursor.execute(sql, (uid_str, u.name))
                ids_en_bd.add(uid_str)
                nuevos_agregados += 1
        
        conn_db.commit()
        if nuevos_agregados > 0:
            logging.info(f"Sincronización: {nuevos_agregados} nuevos usuarios.")
        return {str(x.user_id): x.name for x in users_device}

    except Exception as e:
        logging.error(f"Error sincronización masiva: {e}")
        return {}
    finally:
        if conn_db and conn_db.is_connected():
            cursor.close()
            conn_db.close()

# --- FUNCIONES DE IMPRESIÓN ---
def imprimir_ticket_valido(nombre, user_id):
    p = None
    
    # Valores por defecto
    es_dieta = False 
    sin_sopa = False
    sin_arroz = False

    try:
        # ---------------------------------------------------------
        # 1. CONSULTA A BASE DE DATOS
        # ---------------------------------------------------------
        try:
            conn_temp = mysql.connector.connect(**DB_CONFIG)
            cur_temp = conn_temp.cursor()
            fecha_hoy_str = datetime.now().strftime('%Y-%m-%d')
            
            query = "SELECT opcion, sin_sopa, sin_arroz FROM menu_diario WHERE user_id = %s AND fecha = %s"
            cur_temp.execute(query, (user_id, fecha_hoy_str))
            resultado = cur_temp.fetchone()
            
            if resultado:
                opcion_db, sin_sopa_db, sin_arroz_db = resultado
                if opcion_db == 2: es_dieta = True
                if sin_sopa_db == 1: sin_sopa = True
                if sin_arroz_db == 1: sin_arroz = True
            else:
                # Si no hay web, revisamos lista fija
                if str(user_id) in IDS_CON_DIETA:
                    es_dieta = True
            
        except Exception as e:
            print(f"⚠️ Error SQL: {e}") 
        finally:
            if 'cur_temp' in locals() and cur_temp: cur_temp.close()
            if 'conn_temp' in locals() and conn_temp: conn_temp.close()

        # ---------------------------------------------------------
        # 2. IMPRESIÓN DEL TICKET
        # ---------------------------------------------------------
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        try: p.image(ARCHIVO_LOGO) 
        except: pass 

        p.set(align='center', bold=True, double_height=True)
        p.text("DETCUADOR S.A.\n")
        p.set(align='center', bold=False, double_height=False)
        p.text("CONTROL DE COMEDOR\n")
        p.text("--------------------------------\n")
        
        fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
        p.set(align='left')
        p.text(f"FECHA: {fecha}\n")
        p.text("COLABORADOR:\n")
        
        lineas_nombre = textwrap.wrap(nombre, width=24) 
        for linea in lineas_nombre:
            p.set(align='left', bold=True)
            p.text(f"{linea}\n")

        p.text("\n")
        
        # === TIPO DE MENÚ ===
        if es_dieta:
            p.set(align='center', bold=True, invert=True) 
            p.text("  >>> MENU: DIETA <<<  \n")
        else:
            p.set(align='center', bold=True, invert=False) 
            p.text("  TIPO: NORMAL  \n")
        
        p.set(align='center', bold=False, invert=False)
        
        # === RESTRICCIONES (SOLO TEXTO) ===
        # Solo imprimimos si es True. Si es False, no sale nada.
        
        if sin_sopa or sin_arroz:
            p.text("\n") # Espacio para separar
            p.set(align='center', bold=False, double_height=True)
            
            if sin_sopa:
                p.text("SIN SOPA\n")
            
            if sin_arroz:
                p.text("SIN ARROZ\n")
                
            p.set(align='center', bold=False, double_height=False)
            
        # ==================================
        
        p.text("--------------------------------\n")
        p.set(align='center', bold=True, invert=True)
        p.text(" VALIDO POR 1 ALMUERZO \n\n")
        p.set(align='center', bold=False, invert=False)
        p.text(" Powered by John Alexander Garcia")
        p.text("\n\n\n")
        p.cut()
        print(f"🖨️ [IMP] Ticket enviado.")
        
    except Exception as e:
        print(f"❌ [IMP] Error impresora: {e}")
        logging.error(f"Error impresora: {e}")
    finally:
        if p: p.close()

def imprimir_ticket_extra(nombre_vip):
    p = None
    try:
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        try: p.image(ARCHIVO_LOGO) 
        except: pass 

        p.set(align='center', bold=True)
        p.text("DETCUADOR S.A.\n")
        p.text("TICKET EXTRA\n")
        p.text("--------------------------------\n")
        
        fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
        p.set(align='left')
        p.text(f"AUTORIZA: {nombre_vip}\n")
        p.text(f"FECHA:    {fecha}\n")
        
        p.text("\nPARA EL COLABORADOR:\n\n")
        p.set(align='center', bold=True, double_height=True)
        p.text("______________________\n")
        p.set(align='center', bold=False, double_height=False)
        p.text("(Escribir Nombre)\n")
        
        p.text("--------------------------------\n")
        p.set(align='center', bold=True, invert=True)
        p.text(" VALIDO POR 1 ALMUERZO \n\n")
        p.set(align='center', bold=False, invert=False)        
        p.text(" Powered by John Alexander Garcia")
        p.text("\n\n\n")
        p.cut()
        print(f"🖨️ [IMP] Ticket EXTRA enviado.")
    except Exception as e:
        logging.error(f"Error impresión ticket extra: {e}")
    finally:
        if p: p.close()

def imprimir_ticket_duplicado(nombre, user_id):
    p = None
    try:
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        p.text("\n")
        p.set(align='center', bold=True)
        p.text("=== ALERTA DE SISTEMA ===\n")
        p.text("=== TICKET NO VALIDO ===\n")
        p.text("--------------------------------\n")
        
        fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
        p.set(align='left', bold=False)
        p.text(f"FECHA: {fecha}\n")
        p.text("--------------------------------\n")
        p.set(align='center', bold=True, invert=True)
        p.text(" ACCESO DUPLICADO \n") 
        p.set(align='center', bold=False, invert=False)
        p.text("\n")
        p.set(align='center', bold=True)
        p.text("CASO PERDIDA CONTACTAR\n")
        p.text("CON RRHH\n\n")
        p.text(" Powered by John Alexander Garcia")
        p.text("\n\n") 
        p.cut()
        print(f"🖨️ [IMP] Ticket DUPLICADO enviado.")
    except Exception as e:
        logging.error(f"Error impresión duplicado: {e}")
    finally:
        if p: p.close()

# ==========================================
#   MAIN
# ==========================================

def main():
    print("--- SISTEMA AUDITOR DE COMEDOR 24/7 ---")
    logging.info("Sistema iniciado.")
    
    global memoria_papel
    memoria_papel = {}
    ultimo_dia = datetime.now().day

    verificar_estado_impresora()
    hilo = threading.Thread(target=tarea_monitoreo_periodico, daemon=True)
    hilo.start()

    while True:
        zk = ZK(IP_BIOMETRICO, port=PUERTO_ZK, timeout=60)
        conn = None
        try:
            print(f"\n🔄 Conectando a {IP_BIOMETRICO}...")
            conn = zk.connect()
            print(".: CONECTADO :.")
            user_map_zk = sincronizar_usuarios_db(conn)
            print(".: ESPERANDO HUELLAS :.")
            
            # --- SIN LÓGICA DE TIEMPO DE ESPERA EN PYTHON ---
            # El hardware (Biométrico) controla el tiempo entre huellas.
            for event in conn.live_capture():
                if event is None or event.user_id is None: continue

                estado_imp = verificar_estado_impresora()
                
                # Reset diario
                hoy = datetime.now()
                if hoy.day != ultimo_dia:
                    memoria_papel = {}
                    ultimo_dia = hoy.day
                    logging.info("Cambio de día: Variables reiniciadas.")

                # Procesar usuario
                user_id_str = str(event.user_id)
                nombre_zk = user_map_zk.get(user_id_str, "Desconocido")
                
                if nombre_zk == "Desconocido":
                    logging.warning(f"Usuario desconocido ID {user_id_str}, resincronizando...")
                    user_map_zk = sincronizar_usuarios_db(conn)
                    nombre_zk = user_map_zk.get(user_id_str, "Desconocido")
                
                nombre_completo = obtener_nombre_real(event.user_id, nombre_zk)
                print(f"\n--> Asistencia: {nombre_completo}")
                
                resultado = registrar_evento(event.user_id, nombre_completo)

                # Imprimir solo si impresora está OK
                if estado_imp in ["OFFLINE", "SIN_PAPEL", "TAPA_ABIERTA", "ERROR_MECANICO"]:
                    err = f"❌ OMITIENDO IMPRESIÓN: {estado_imp}"
                    print(err)
                    logging.error(err)
                else:
                    if resultado == "TICKET ALMUERZO":
                        imprimir_ticket_valido(nombre_completo, event.user_id)
                    elif resultado == "TICKET EXTRA":
                        imprimir_ticket_extra(nombre_completo)
                    elif resultado == "DUPLICADO":
                        imprimir_ticket_duplicado(nombre_completo, event.user_id)

                sys.stdout.flush() 

        except KeyboardInterrupt:
            print("\n Apagando...")
            logging.info("Sistema apagado por usuario.")
            break 
        except Exception as e:
            msg = f"Error conexión Biométrico: {e}"
            print(f"\n⚠️ {msg}")
            logging.error(msg)
            time.sleep(5)
        finally:
            if conn:
                try: conn.disconnect()
                except: pass

if __name__ == "__main__":
    main()